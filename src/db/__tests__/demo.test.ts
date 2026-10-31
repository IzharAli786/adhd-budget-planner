import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STARTER_CATEGORIES } from '../../domain/categories'
import { addDays, daysBetween, isValidISODate } from '../../domain/dates'
import { gardenPoints, spendDates } from '../../domain/garden'
import { isImpulseExpired } from '../../domain/impulse'
import { isSpend } from '../../domain/reconcile'
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
import { buildDemoData, seedDemo } from '../seed/demo'
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
          expect(daysBetween(t.date, today)).toBeLessThanOrEqual(14)
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
    expect(data.bills.length).toBeLessThanOrEqual(8)
    expect(regular.map((b) => b.name)).toEqual(
      expect.arrayContaining(['Rent', 'Phone', 'Streaming', 'Home insurance']),
    )
    // Some bills paid, some still to come.
    expect(data.billOccurrences.length).toBeGreaterThan(0)
    expect(data.bills.length).toBeGreaterThan(data.billOccurrences.length)

    expect(data.transactions.length).toBeGreaterThanOrEqual(23)
    expect(data.transactions.length).toBeLessThanOrEqual(27)
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
    expect(data.envelopes.every((e) => e.budget === 0)).toBe(true)
    const ids = new Set(data.envelopes.map((e) => e.id))
    const tagged = data.transactions.filter((t) => t.envelopeId !== undefined)
    expect(tagged.length).toBeGreaterThan(10)
    for (const t of tagged) expect(ids.has(t.envelopeId!)).toBe(true)
    // One payday note, one day note.
    expect(data.notes.filter((n) => n.periodStart).length).toBe(1)
    expect(data.notes.filter((n) => n.date).length).toBe(1)
    expect(data.gardenPoints).toBeGreaterThanOrEqual(
      gardenPoints({ ...data, occurrences: data.billOccurrences }),
    )
  })

  it('keeps amounts in whole currency units for any decimals', () => {
    const yen = buildDemoData(TODAY, NOW, 0)
    const euro = buildDemoData(TODAY, NOW, 2)
    expect(yen.incomes[0]!.amount).toBe(1640)
    expect(euro.incomes[0]!.amount).toBe(164000)
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
    expect((await db.incomes.toArray())[0]!.amount).toBe(1640)
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
    await r.updateDebt('demo-debt-car', { dueDay: 20 }, TODAY)
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
    expect(await db.bills.count()).toBe(8)
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
