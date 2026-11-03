import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STARTER_CATEGORIES } from '../../domain/categories'
import { addDays, daysBetween, isValidISODate } from '../../domain/dates'
import { gardenPoints, spendDates } from '../../domain/garden'
import { compare, defaultBudget, negativeAmortization } from '../../domain/debt'
import { isImpulseExpired } from '../../domain/impulse'
import { isSpend } from '../../domain/reconcile'
import { billEntriesBetween } from '../../domain/bills'
import { isDebtPayment, isEverydaySpend } from '../../domain/insights'
import { historyStart, payPeriodRanges, periodSummaries, totalFlows } from '../../domain/review'
import { monthSpan } from '../../domain/safeToSpend'
import { planToday } from '../../domain/today'
import { todayISO } from '../../lib/clock'
import { exportBackup, importBackup, validateBackup } from '../backup'
import {
  DEMO_CAP,
  DemoLimitError,
  demoCapGuard,
  demoExpired,
  getDemoState,
  onDemoLimit,
  resetDemo,
  resetIfExpired,
  startDemo,
} from '../demo'
import * as r from '../repos'
import { db } from '../schema'
import { buildDemoData, DEMO_PAST_PERIODS, DEMO_PAY, seedDemo } from '../seed/demo'
import { setCreateGuard, undoLast } from '../undo'
import { resetDb } from './helpers'

// Sat 31 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 31, 10, 0)
const TODAY = '2026-10-31'

describe('sample data', () => {
  // Any day of the year, any hour: month ends, Feb 29, weekends.
  const someDay = fc
    .record({
      day: fc.integer({ min: 0, max: 365 * 4 }),
      hour: fc.integer({ min: 0, max: 23 }),
      decimals: fc.constantFrom(0, 2, 3),
    })
    .map(({ day, hour, decimals }) => {
      const today = addDays('2026-01-01', day)
      const [y, m, d] = today.split('-').map(Number) as [number, number, number]
      return { today, now: new Date(y, m - 1, d, hour, 30), decimals }
    })

  it('is built relative to today: every date is real and nothing is in the future', () => {
    fc.assert(
      fc.property(someDay, ({ today, now, decimals }) => {
        const data = buildDemoData(today, now, decimals)
        const nowISO = now.toISOString()
        for (const t of data.transactions) {
          expect(isValidISODate(t.date)).toBe(true)
          expect(daysBetween(t.date, today)).toBeGreaterThanOrEqual(0)
          // About nine months back, never more than a year.
          expect(daysBetween(t.date, today)).toBeLessThanOrEqual(14 * (DEMO_PAST_PERIODS + 1) + 7)
          expect(t.createdAt <= nowISO).toBe(true)
        }
        for (const c of data.checkIns) {
          expect(isValidISODate(c.date)).toBe(true)
          expect(c.date <= today).toBe(true)
          expect(c.at <= nowISO).toBe(true)
        }
        for (const o of data.billOccurrences) {
          expect(o.originalDate < today).toBe(true)
          expect(o.paidAt! <= nowISO).toBe(true)
        }
        for (const b of data.bills) {
          expect(b.rule.freq).toBe('monthly')
          if (b.rule.freq === 'monthly') {
            expect(isValidISODate(b.rule.anchor)).toBe(true)
            expect(b.rule.day).toBeLessThanOrEqual(28)
          }
        }
        for (const i of data.impulse) expect(i.addedAt <= nowISO).toBe(true)
        for (const d of data.noSpend) expect(d.date < today).toBe(true)
        const income = data.incomes[0]!
        expect(income.schedule.kind).toBe('biweekly')
        if (income.schedule.kind === 'biweekly') {
          expect(income.schedule.anchor < today).toBe(true)
        }
        for (const f of data.funds) {
          if (f.targetDate) expect(f.targetDate > today).toBe(true)
          if (f.challenge) expect(f.challenge.start < today).toBe(true)
        }
      }),
      { numRuns: 60 },
    )
  })

  it('never has a negative number where one makes no sense', () => {
    fc.assert(
      fc.property(someDay, ({ today, now, decimals }) => {
        const data = buildDemoData(today, now, decimals)
        const amounts = [
          ...data.incomes.map((i) => i.amount),
          ...data.bills.map((b) => b.amount),
          ...data.checkIns.map((c) => c.balance),
          ...data.funds.flatMap((f) => [f.target ?? 0, f.perPeriod, f.openingSaved]),
          ...data.debts.flatMap((d) => [d.balance, d.originalBalance, d.minPayment, d.aprBps]),
          ...data.impulse.map((i) => i.amount),
          ...data.billOccurrences.map((o) => o.paidAmount ?? 0),
          // Spending and fund moves are stored negative (money out); their size is not.
          ...data.transactions.map((t) => -t.amount),
          data.gardenPoints,
        ]
        for (const n of amounts) {
          expect(Number.isSafeInteger(n)).toBe(true)
          expect(n).toBeGreaterThanOrEqual(0)
        }
        for (const d of data.debts) expect(d.balance).toBeLessThanOrEqual(d.originalBalance)
      }),
      { numRuns: 60 },
    )
  })

  it('looks like a real household', () => {
    const data = buildDemoData(TODAY, NOW)
    const regular = data.bills.filter((b) => !b.debtId)
    expect(regular.length).toBeGreaterThanOrEqual(6)
    expect(data.bills.length).toBeLessThanOrEqual(9)
    expect(regular.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Rent', 'Phone', 'Streaming', 'Home insurance']),
    )
    // Every bill paid on each of its past dates (nothing overdue), each everyday one in a
    // category, so rent and the rest show up in Insights.
    const start = data.checkIns[0]!.date
    const past = billEntriesBetween(data.bills, [], start, TODAY)
    expect(past.length).toBeGreaterThan(6 * data.bills.length)
    const paid = new Set(data.billOccurrences.map((o) => o.id))
    for (const e of past) expect(paid.has(`${e.billId}|${e.originalDate}`)).toBe(true)
    for (const b of regular) expect(b.envelopeId).toBeDefined()
    // ...and some still to come before payday.
    expect(billEntriesBetween(data.bills, [], TODAY, addDays(TODAY, 14)).length).toBeGreaterThan(0)

    // 6-12 months of history, with 8-15 tagged everyday entries in every past pay period.
    expect(daysBetween(start, TODAY)).toBeGreaterThanOrEqual(183)
    expect(daysBetween(start, TODAY)).toBeLessThanOrEqual(366)
    const income = data.incomes[0]!
    const periods = payPeriodRanges(
      { incomes: data.incomes, paydayOverrides: [] },
      { start, end: addDays(TODAY, -14) },
    ).filter((r) => r.end <= addDays(TODAY, -13))
    expect(periods.length).toBeGreaterThanOrEqual(12)
    for (const r of periods) {
      const spends = data.transactions.filter(
        (t) => isEverydaySpend(t) && t.envelopeId && t.date >= r.start && t.date < r.end,
      )
      expect(spends.length).toBeGreaterThanOrEqual(8)
      expect(spends.length).toBeLessThanOrEqual(15)
    }
    // A check-in every payday, so each one has a carry-over to show.
    const checkInDays = new Set(data.checkIns.map((c) => c.date))
    if (income.schedule.kind === 'biweekly')
      for (const r of periods) expect(checkInDays.has(r.start)).toBe(true)
    // Both funds and both debts have history.
    for (const f of data.funds)
      expect(data.transactions.filter((t) => t.fundId === f.id).length).toBeGreaterThan(6)
    for (const d of data.debts) {
      const min = data.bills.find((b) => b.debtId === d.id)!
      expect(data.billOccurrences.filter((o) => o.billId === min.id).length).toBeGreaterThan(5)
    }
    expect(data.transactions.some((t) => isDebtPayment(t))).toBe(true)
    expect(data.funds).toHaveLength(2)
    expect(data.funds.some((f) => f.challenge?.kind === '52week')).toBe(true)
    expect(data.debts).toHaveLength(2)
    // Each debt has its linked minimum bill, as the app makes them.
    for (const d of data.debts) expect(data.bills.filter((b) => b.debtId === d.id)).toHaveLength(1)

    // Marked no-spend days really have no spending (the garden only counts those).
    const spent = spendDates(data.transactions)
    expect(data.noSpend.length).toBeGreaterThanOrEqual(2)
    for (const d of data.noSpend) expect(spent.has(d.date)).toBe(false)

    const now = NOW.toISOString()
    expect(data.impulse).toHaveLength(2)
    expect(data.impulse.filter((i) => isImpulseExpired(i, now))).toHaveLength(1)

    expect(data.transactions.some((t) => t.date === TODAY && isSpend(t))).toBe(true)

    // The common categories, as Plan's one tap makes them, with spending tagged into them.
    expect(data.envelopes.filter((e) => e.isDefault).map((e) => e.name)).toEqual(['Everyday'])
    expect(data.envelopes.map((e) => e.name)).toEqual(
      expect.arrayContaining(STARTER_CATEGORIES.map((c) => c.name)),
    )
    // A budget on every category, Everyday and the bill ones included, so no row reads
    // "no budget yet" and the planned-against-actual bars all have a plan to compare.
    for (const e of data.envelopes) expect(e.budget, e.name).toBeGreaterThan(0)
    // Rent sits in its own category, as the bill form now suggests for it.
    const rent = data.bills.find((b) => b.name === 'Rent')!
    expect(data.envelopes.find((e) => e.id === rent.envelopeId)!.name).toBe('Rent & housing')
    const ids = new Set(data.envelopes.map((e) => e.id))
    const tagged = data.transactions.filter((t) => t.envelopeId !== undefined)
    expect(tagged.length).toBeGreaterThan(10)
    for (const t of tagged) expect(ids.has(t.envelopeId!)).toBe(true)
    // One payday note, one day note.
    expect(data.notes.filter((n) => n.periodStart).length).toBe(1)
    expect(data.notes.filter((n) => n.date).length).toBe(1)
    expect(data.gardenPoints).toBe(gardenPoints({ ...data, occurrences: data.billOccurrences }))
  })

  it('keeps today sensible on any day: ready, positive, and the history adds up', () => {
    fc.assert(
      fc.property(someDay, ({ today, now, decimals }) => {
        const data = buildDemoData(today, now, decimals)
        // The same money settings seedDemo writes: this month, no roll over, no cushion.
        const plan = planToday({
          today,
          money: {
            planBy: 'month',
            startDate: monthSpan(today).start,
            startingBalance: 0,
            rollover: false,
          },
          incomes: data.incomes,
          paydayOverrides: [],
          bills: data.bills,
          occurrences: data.billOccurrences,
          transactions: data.transactions,
          envelopes: data.envelopes,
          envelopesEnabled: true,
        })
        expect(plan.kind).toBe('ready')
        if (plan.kind !== 'ready') return
        // A month's pay minus its bills, never the year's savings. Paid every two weeks,
        // a month holds at most three paydays.
        expect(plan.safe.total).toBeLessThan(3 * DEMO_PAY * 10 ** decimals)
        // Nothing overdue, nothing short, and a balance never below zero at a check-in.
        expect(plan.safe.dueEntries.every((e) => e.date >= today)).toBe(true)
        expect(plan.safe.total).toBeGreaterThan(0)
        for (const c of data.checkIns) expect(c.balance).toBeGreaterThan(0)
        // Look back: each payday's carry-over comes straight from its check-in, and none
        // of the paydays is a loss on paper the household never had.
        const input = {
          today,
          incomes: data.incomes,
          paydayOverrides: [],
          bills: data.bills,
          occurrences: data.billOccurrences,
          transactions: data.transactions,
          checkIns: data.checkIns,
        }
        const year = Number(today.slice(0, 4))
        for (const row of periodSummaries(year, 'payday', input))
          if (row.carried) expect(row.carried.amount).toBeGreaterThanOrEqual(0)

        // The sample year is a steady one: every finished month has money left over, but
        // for at most one that dips a little, and the year as a whole is positive.
        const since = historyStart(input)
        const months = [year - 1, year].flatMap((y) =>
          periodSummaries(y, 'month', { ...input, since }).filter((r) => r.end <= today),
        )
        const dips = months.filter((r) => r.net < 0)
        expect(dips.length).toBeLessThanOrEqual(1)
        for (const r of dips) expect(r.net).toBeGreaterThan(-(10 ** decimals) * 100)
        expect(totalFlows(months).net).toBeGreaterThan(0)
        // Look back starts where the sample starts: on its first payday, with a check-in.
        expect(since).toBe(data.checkIns[0]!.date)
      }),
      { numRuns: 40 },
    )
  })

  it('tells snowball and avalanche apart: different orders, real interest saved', () => {
    const data = buildDemoData(TODAY, NOW)
    const owing = data.debts.filter((d) => d.balance > 0)
    const result = compare(owing, defaultBudget(owing, 5000))
    if ('error' in result) throw new Error(result.error)
    // Avalanche saves at least €50 of interest over snowball.
    expect(result.interestSaved).toBeGreaterThan(5000)
    const firstCleared = (schedule: number[][]) =>
      schedule.findIndex((row) => row.some((b) => b === 0))
    const clearedFirst = (sim: { schedule: number[][] }) => {
      const month = firstCleared(sim.schedule)
      return sim.schedule[month]!.findIndex((b) => b === 0)
    }
    expect(clearedFirst(result.snowball)).not.toBe(clearedFirst(result.avalanche))
    // Nothing that only grows on its minimum.
    expect(negativeAmortization(owing)).toEqual([])
  })

  it('keeps amounts in whole currency units for any decimals', () => {
    const yen = buildDemoData(TODAY, NOW, 0)
    const euro = buildDemoData(TODAY, NOW, 2)
    expect(yen.incomes[0]!.amount).toBe(DEMO_PAY)
    expect(euro.incomes[0]!.amount).toBe(DEMO_PAY * 100)
    expect(yen.buffer % 100).toBe(0)
    expect(euro.buffer % 10000).toBe(0)
  })
})

describe('seedDemo', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await resetDb()
  })
  afterEach(() => {
    setCreateGuard(null)
    vi.useRealTimers()
  })

  it('writes a finished setup that a backup validates without a single broken reference', async () => {
    await r.addTransaction({ date: TODAY, amount: -100, note: 'before' })
    await seedDemo(NOW)
    expect(await r.setupComplete()).toBe(true)
    expect((await r.getSettings()).simpleMode).toBe(false)
    expect(await getDemoState()).toEqual({
      startedAt: NOW.toISOString(),
      kind: 'sample',
      entries: 0,
    })
    // Whatever was there before is gone, not mixed in.
    expect((await db.transactions.toArray()).some((t) => t.note === 'before')).toBe(false)
    const result = validateBackup(await exportBackup(NOW, 'full'))
    expect(result.ok).toBe(true)
  })

  it('on a first visit, uses the device locale (as setup would), not the EUR default', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    try {
      await seedDemo(NOW)
    } finally {
      vi.unstubAllGlobals()
    }
    const settings = await r.getSettings()
    expect(settings).toMatchObject({ locale: 'en-US', currency: 'USD', decimals: 2, weekStart: 0 })
  })

  it('uses the decimals of the currency already chosen', async () => {
    await r.updateSettings({ currency: 'JPY', decimals: 0 })
    await seedDemo(NOW)
    expect((await db.incomes.toArray())[0]!.amount).toBe(DEMO_PAY)
    expect((await r.getSettings()).currency).toBe('JPY')
  })
})

describe('entry cap', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await resetDb()
    setCreateGuard(demoCapGuard)
  })
  afterEach(() => {
    setCreateGuard(null)
    vi.useRealTimers()
  })

  const spend = (note: string) => r.addTransaction({ date: TODAY, amount: -100, note })

  it(`allows ${DEMO_CAP} entries, then refuses the next without writing it`, async () => {
    await startDemo('own', NOW)
    for (let i = 0; i < DEMO_CAP; i++) await spend(`coffee ${i}`)
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)

    const undoSteps = await db.undo.count()
    const heard = vi.fn()
    const off = onDemoLimit(heard)
    await expect(spend('one more')).rejects.toBeInstanceOf(DemoLimitError)
    off()
    expect(heard).toHaveBeenCalledOnce()
    expect(await db.transactions.count()).toBe(DEMO_CAP)
    // A refused action leaves no undo step and no half-written counter.
    expect(await db.undo.count()).toBe(undoSteps)
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)
  })

  it('does not count sample rows, edits, deletes, paid ticks or no-spend marks', async () => {
    await seedDemo(NOW)
    const [tx] = await db.transactions.toArray()
    await r.updateTransaction(tx!.id, { note: 'Flat white' })
    await r.deleteTransaction(tx!.id)
    const phone = (await db.bills.get('demo-bill-phone'))!
    if (phone.rule.freq === 'monthly') await r.markPaid(phone.id, phone.rule.anchor, phone.amount)
    await r.toggleNoSpend(addDays(TODAY, -12))
    expect((await getDemoState())!.entries).toBe(0)
  })

  it('counts one action as one entry, even when it writes two rows', async () => {
    await startDemo('own', NOW)
    await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: TODAY,
      aprBps: 1990,
      minPayment: 2500,
      dueDay: 15,
    })
    expect(await db.bills.count()).toBe(1)
    expect((await getDemoState())!.entries).toBe(1)
  })

  const fillToCap = async () => {
    for (let i = 0; i < DEMO_CAP; i++) await spend(`coffee ${i}`)
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)
  }

  it('still allows a balance check-in and a catch-up at the cap, so Today never goes stale', async () => {
    await seedDemo(NOW)
    await fillToCap()
    const before = await db.checkIns.count()
    await r.addCheckIn(120000, TODAY)
    await r.applyFreshStart({ balance: 110000, date: TODAY, paid: [], archive: [] })
    expect(await db.checkIns.count()).toBe(before + 2)
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)
  })

  it('never counts an edit, even one that splits a bill or debt into a new row', async () => {
    await seedDemo(NOW)
    await fillToCap()
    const rent = (await db.bills.get('demo-bill-rent'))!
    const bills = await db.bills.count()
    // "Change from this date on" ends the old series and starts a new bill row.
    await r.editBillFrom(rent.id, addDays(TODAY, 20), { amount: 99000 })
    // A due-day change on a debt with a paid month splits its minimum bill too.
    await r.updateDebt('demo-debt-loan', { dueDay: 20 }, TODAY)
    expect(await db.bills.count()).toBeGreaterThan(bills)
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)
  })

  it('gives the entry back when an add is undone, but not when an edit is', async () => {
    await startDemo('own', NOW)
    await fillToCap()
    await undoLast()
    expect((await getDemoState())!.entries).toBe(DEMO_CAP - 1)
    await spend('again')
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)

    const [tx] = await db.transactions.toArray()
    await r.updateTransaction(tx!.id, { note: 'edited' })
    await undoLast()
    expect((await getDemoState())!.entries).toBe(DEMO_CAP)
  })

  it('has no cap outside the demo (no demo state, no guard)', async () => {
    setCreateGuard(null)
    for (let i = 0; i < DEMO_CAP + 3; i++) await spend(`x${i}`)
    expect(await db.transactions.count()).toBe(DEMO_CAP + 3)
  })
})

describe('reset', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await resetDb()
  })
  afterEach(() => vi.useRealTimers())

  it('Reset demo clears everything, so the two ways in show again', async () => {
    await seedDemo(NOW)
    await resetDemo()
    for (const table of db.tables) expect(await table.count()).toBe(0)
    expect(await getDemoState()).toBeUndefined()
  })

  it('resets on its own 7 days after the demo started, not before', async () => {
    await seedDemo(NOW)
    const sixDays = new Date(NOW.getTime() + 6.9 * 86_400_000)
    const sevenDays = new Date(NOW.getTime() + 7 * 86_400_000)
    expect(demoExpired({ startedAt: NOW.toISOString() }, sixDays)).toBe(false)
    expect(await resetIfExpired(sixDays)).toBe(false)
    expect(await db.transactions.count()).toBeGreaterThan(0)
    expect(await resetIfExpired(sevenDays)).toBe(true)
    expect(await db.transactions.count()).toBe(0)
    expect(await getDemoState()).toBeUndefined()
  })

  it('does nothing when no demo was started', async () => {
    expect(await resetIfExpired(new Date(2030, 0, 1))).toBe(false)
  })
})

describe('bring your setup into the full app', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await resetDb()
  })
  afterEach(() => vi.useRealTimers())

  it('a demo file restores the setup only, never the sample activity or demo state', async () => {
    await seedDemo(NOW)
    const file = await exportBackup(NOW, 'demo')
    expect(file.source).toBe('demo')
    // The demo's own bookkeeping never leaves the device.
    expect(file.data.meta.some((m) => m.key === 'demo')).toBe(false)

    const result = validateBackup(JSON.stringify(file))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // The full app, later: it already has its own settings and nothing else.
    await resetDb()
    await r.updateSettings({ theme: 'sage' })
    await importBackup(result.backup, NOW)

    expect(await db.incomes.count()).toBe(1)
    expect(await db.bills.count()).toBe(9)
    expect(await db.funds.count()).toBe(2)
    expect(await db.debts.count()).toBe(2)
    for (const table of ['transactions', 'checkIns', 'billOccurrences', 'impulse', 'noSpend']) {
      expect(await db.table(table).count()).toBe(0)
    }
    expect(await getDemoState()).toBeUndefined()
    expect((await r.getSettings()).theme).toBe('sage')
    expect(todayISO(NOW)).toBe(TODAY)
  })
})
