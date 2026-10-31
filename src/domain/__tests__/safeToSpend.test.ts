import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addedOnMap, billEntriesBetween, paidFields } from '../bills'
import { addDays, fromDayNumber, makeDate, parseISODate, toDayNumber } from '../dates'
import { checkInPlan } from '../reconcile'
import { ESTIMATE_NOTE, safeToSpend, simpleLines, type SafeToSpendInput } from '../safeToSpend'
import { planToday, type TodayInput } from '../today'
import {
  occurrenceId,
  type Bill,
  type BillOccurrence,
  type Envelope,
  type IncomeSource,
  type SavingsFund,
  type Transaction,
} from '../types'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
const created = '2026-01-01T00:00:00.000Z'
const monthly = (
  id: string,
  name: string,
  amount: number,
  day: number,
  extra: Partial<Bill> = {},
) =>
  ({
    id,
    name,
    amount,
    rule: { freq: 'monthly', interval: 1, day, anchor: makeDate(2026, 1, day) },
    autopay: false,
    createdAt: created,
    ...extra,
  }) as Bill

// A worked example, numbers checked by hand.
describe('safeToSpend: worked example', () => {
  const input: SafeToSpendInput = {
    today: '2026-11-04',
    period: { start: '2026-10-30', end: '2026-11-30' },
    checkIn: { at: '2026-11-02T09:00:00.000Z', date: '2026-11-02', balance: 150000 },
    lookback: '2026-10-30',
    bills: [
      monthly('rent', 'Rent', 95000, 1),
      monthly('gym', 'Gym', 3000, 3),
      monthly('phone', 'Phone', 2500, 15, { autopay: true }),
    ],
    occurrences: [
      {
        id: 'rent|2026-11-01',
        billId: 'rent',
        originalDate: '2026-11-01',
        status: 'paid',
        paidAmount: 95000,
        paidAt: '2026-11-01T10:00:00.000Z',
      },
    ],
    transactions: [
      {
        id: 'old',
        date: '2026-11-01',
        amount: -500,
        note: 'before',
        createdAt: '2026-11-01T12:00:00.000Z',
      },
      {
        id: 'c',
        date: '2026-11-03',
        amount: -1200,
        note: 'coffee',
        createdAt: '2026-11-03T08:00:00.000Z',
      },
      {
        id: 'i',
        date: '2026-11-03',
        amount: 2000,
        note: 'refund',
        createdAt: '2026-11-03T09:00:00.000Z',
      },
      {
        id: 's',
        date: '2026-11-03',
        amount: -2000,
        note: 'to savings',
        fundId: 'hol',
        createdAt: '2026-11-03T10:00:00.000Z',
      },
    ],
    funds: [{ id: 'hol', name: 'Holiday', perPeriod: 5000, openingSaved: 0 }],
    buffer: 5000,
  }
  const r = safeToSpend(input)

  it('follows the formula', () => {
    expect(r.currentBalance).toBe(150000 - 1200 + 2000 - 2000)
    expect(r.billsDue).toBe(3000 + 2500) // gym (overdue) + phone; rent is paid
    expect(r.savingsPlanned).toBe(3000)
    expect(r.envelopeReserved).toBe(0)
    expect(r.total).toBe(148800 - 5500 - 3000 - 5000)
    expect(r.status).toBe('ok')
    expect(r.balanceAgeDays).toBe(2)
    expect(r.estimateNote).toBe(ESTIMATE_NOTE)
    expect(r.estimateNote).toBe('Estimate based on what you entered.')
    expect(r.dueEntries.map((e) => e.name)).toEqual(['Gym', 'Phone'])
  })

  it('the full lines and the 4 simple lines both sum to the total', () => {
    expect(r.lines.map((l) => l.id)).toEqual(['balance', 'since', 'bills', 'savings', 'buffer'])
    expect(sum(r.lines.map((l) => l.amount))).toBe(r.total)
    const simple = simpleLines(r)
    expect(simple.map((l) => l.label)).toEqual([
      'Balance',
      'Bills before payday',
      'Set aside (savings, envelopes, buffer)',
      'Safe to spend',
    ])
    expect(sum(simple.slice(0, 3).map((l) => l.amount))).toBe(simple[3]!.amount)
    expect(simple[3]!.amount).toBe(r.total)
  })

  it('each line with items sums its items', () => {
    for (const line of r.lines)
      if (line.items && line.items.length)
        expect(sum(line.items.map((i) => i.amount))).toBe(line.amount)
  })

  it('a negative total is "short"', () => {
    const short = safeToSpend({ ...input, checkIn: { ...input.checkIn, balance: 10000 } })
    expect(short.total).toBeLessThan(0)
    expect(short.status).toBe('short')
  })

  it('ticking a bill paid after the check-in leaves the total alone', () => {
    const paidGym: BillOccurrence = {
      id: 'gym|2026-11-03',
      billId: 'gym',
      originalDate: '2026-11-03',
      ...paidFields(undefined, 3000, '2026-11-04T08:00:00.000Z'),
    }
    const after = safeToSpend({ ...input, occurrences: [...input.occurrences, paidGym] })
    expect(after.total).toBe(r.total)
    expect(after.lines.find((l) => l.id === 'paidSince')?.amount).toBe(-3000)
  })

  it('envelopes on: untagged spending uses Everyday; a linked bill shrinks its envelope', () => {
    const envelopes: Envelope[] = [
      { id: 'every', name: 'Everyday', budget: 20000, isDefault: true, color: 'accent', sort: 0 },
      { id: 'gymEnv', name: 'Gym', budget: 5000, isDefault: false, color: 'sage', sort: 1 },
    ]
    const bills = input.bills.map((b) => (b.id === 'gym' ? { ...b, envelopeId: 'gymEnv' } : b))
    const withEnv = safeToSpend({ ...input, bills, envelopes, envelopesEnabled: true })
    // Everyday: 20000 − 1200 coffee + 2000 refund → spent floored at 0 → 20000 reserved.
    // Gym: 5000 − 3000 linked unpaid = 2000.
    expect(withEnv.envelopeReserved).toBe(20000 + 2000)
    expect(sum(withEnv.lines.map((l) => l.amount))).toBe(withEnv.total)
    // Ignored while the feature is off.
    expect(safeToSpend({ ...input, bills, envelopes }).envelopeReserved).toBe(0)
  })
})

// --- Properties (PLAN §4.1) ---------------------------------------------------------------

const income: IncomeSource = {
  id: 'pay',
  name: 'Salary',
  amount: 210000,
  schedule: { kind: 'monthly', day: 'last' },
  weekendRule: 'before',
  primary: true,
  active: true,
}

const DAY0 = toDayNumber('2026-09-01')
const arbDay = fc.integer({ min: 0, max: 200 }).map((n) => fromDayNumber(DAY0 + n))

interface World {
  base: Omit<TodayInput, 'today'>
  checkInDate: string
  today: string
}

/**
 * A random but internally consistent world: a check-in, bills (some autopay, some linked
 * to envelopes), paid rows, transactions dated up to today, funds and a buffer.
 * Instants: everything "before" the check-in is at 11:00 on its day, everything "after"
 * at 13:00, so a later check-in at 23:00 today comes after all of it.
 */
const arbWorld: fc.Arbitrary<World> = fc
  .record({
    checkInDay: arbDay,
    age: fc.integer({ min: 0, max: 45 }),
    balance: fc.integer({ min: -100000, max: 500000 }),
    bills: fc.array(
      fc.record({
        amount: fc.integer({ min: 1, max: 150000 }),
        day: fc.integer({ min: 1, max: 28 }),
        autopay: fc.boolean(),
        envelope: fc.constantFrom(undefined, 'every', 'food'),
        paid: fc.array(
          fc.record({ monthOffset: fc.integer({ min: -2, max: 2 }), after: fc.boolean() }),
          {
            maxLength: 2,
          },
        ),
      }),
      { maxLength: 6 },
    ),
    txs: fc.array(
      fc.record({
        amount: fc.integer({ min: -50000, max: 50000 }).filter((n) => n !== 0),
        dayOffset: fc.integer({ min: -20, max: 45 }),
        after: fc.boolean(),
        inBalance: fc.boolean(),
        kind: fc.constantFrom('plain', 'plain', 'fund', 'food'),
      }),
      { maxLength: 10 },
    ),
    funds: fc.array(fc.integer({ min: 0, max: 30000 }), { maxLength: 2 }),
    envelopesEnabled: fc.boolean(),
    budgets: fc.tuple(fc.nat(60000), fc.nat(30000)),
    buffer: fc.nat(10000),
  })
  .map((g) => {
    const checkInDate = g.checkInDay
    const today = addDays(checkInDate, g.age)
    const at = (_date: string, after: boolean) => `${checkInDate}T${after ? '13' : '11'}:00:00.000Z`
    const bills: Bill[] = []
    const occurrences: BillOccurrence[] = []
    g.bills.forEach((b, i) => {
      const bill = monthly(`b${i}`, `Bill ${i}`, b.amount, b.day, {
        autopay: b.autopay,
        ...(b.envelope ? { envelopeId: b.envelope } : {}),
      })
      bills.push(bill)
      const { year, month } = parseISODate(checkInDate)
      for (const p of b.paid) {
        const index = year * 12 + month - 1 + p.monthOffset
        const date = makeDate(Math.floor(index / 12), (index % 12) + 1, b.day)
        occurrences.push({
          id: occurrenceId(bill.id, date),
          billId: bill.id,
          originalDate: date,
          ...paidFields(undefined, b.amount, at(date, p.after)),
        })
      }
    })
    const funds: SavingsFund[] = g.funds.map((perPeriod, i) => ({
      id: `f${i}`,
      name: `Fund ${i}`,
      perPeriod,
      openingSaved: 0,
    }))
    const transactions: Transaction[] = g.txs.map((t, i) => {
      const date = addDays(checkInDate, t.dayOffset)
      return {
        id: `t${i}`,
        date: date > today ? today : date,
        amount: t.amount,
        note: `tx ${i}`,
        createdAt: at(date, t.after),
        ...(t.inBalance ? { inBalance: true } : {}),
        ...(t.kind === 'fund' && funds.length ? { fundId: 'f0' } : {}),
        ...(t.kind === 'food' ? { envelopeId: 'food' } : {}),
      }
    })
    const envelopes: Envelope[] = [
      {
        id: 'every',
        name: 'Everyday',
        budget: g.budgets[0],
        isDefault: true,
        color: 'accent',
        sort: 0,
      },
      { id: 'food', name: 'Food', budget: g.budgets[1], isDefault: false, color: 'sage', sort: 1 },
    ]
    return {
      checkInDate,
      today,
      base: {
        incomes: [income],
        paydayOverrides: [],
        bills,
        occurrences,
        transactions,
        checkIn: {
          at: at(checkInDate, false).replace('T11', 'T12'),
          date: checkInDate,
          balance: g.balance,
        },
        funds,
        envelopes,
        envelopesEnabled: g.envelopesEnabled,
        buffer: g.buffer,
      },
    }
  })

function ready(input: TodayInput) {
  const plan = planToday(input)
  if (plan.kind !== 'ready') throw new Error(`expected a ready plan, got ${plan.kind}`)
  return plan
}
const totalOf = (input: TodayInput) => ready(input).safe.total

describe('safe-to-spend properties (PLAN §4.1)', () => {
  it('lines always sum to the total, in Full and Simple', () => {
    fc.assert(
      fc.property(arbWorld, ({ base, today }) => {
        const { safe } = ready({ ...base, today })
        expect(sum(safe.lines.map((l) => l.amount))).toBe(safe.total)
        const simple = simpleLines(safe)
        expect(simple).toHaveLength(4)
        expect(sum(simple.slice(0, 3).map((l) => l.amount))).toBe(safe.total)
        expect(safe.status).toBe(safe.total < 0 ? 'short' : 'ok')
      }),
    )
  })

  it('time passing never raises it unless money comes in', () => {
    fc.assert(
      fc.property(arbWorld, fc.integer({ min: 1, max: 70 }), ({ base, today }, k) => {
        // One known exception, left out here: an envelope-linked bill PAID AHEAD for a
        // later period uses up that period's envelope when it arrives, so less is
        // reserved then. The money left long ago; the envelope just catches up.
        const { period } = ready({ ...base, today })
        const world = {
          ...base,
          occurrences: base.occurrences.filter((o) => o.originalDate < period.end),
        }
        expect(totalOf({ ...world, today: addDays(today, k) })).toBeLessThanOrEqual(
          totalOf({ ...world, today }),
        )
      }),
    )
  })

  it('adding a bill never raises it', () => {
    fc.assert(
      fc.property(
        arbWorld,
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 28 }),
        fc.boolean(),
        fc.constantFrom(undefined, 'every', 'food'),
        ({ base, today }, amount, day, autopay, envelopeId) => {
          const extra = monthly('new', 'New', amount, day, {
            autopay,
            ...(envelopeId ? { envelopeId } : {}),
          })
          expect(totalOf({ ...base, today, bills: [...base.bills, extra] })).toBeLessThanOrEqual(
            totalOf({ ...base, today }),
          )
        },
      ),
    )
  })

  it('an overdue unpaid bill lowers it (by exactly its amount)', () => {
    fc.assert(
      fc.property(
        arbWorld,
        fc.integer({ min: 1, max: 100000 }),
        fc.nat(),
        ({ base, today }, amount, pick) => {
          const { lookback } = ready({ ...base, today })
          const span = toDayNumber(today) - toDayNumber(lookback)
          fc.pre(span > 0)
          const date = addDays(lookback, pick % span) // in [lookback, today)
          const overdue: Bill = {
            id: 'late',
            name: 'Late',
            amount,
            rule: { freq: 'once', date },
            autopay: false,
            createdAt: created,
          }
          const before = totalOf({ ...base, today })
          expect(totalOf({ ...base, today, bills: [...base.bills, overdue] })).toBe(before - amount)
        },
      ),
    )
  })

  it('a check-in after an autopay bill does not change it (no double count)', () => {
    fc.assert(
      fc.property(arbWorld, ({ base, today }) => {
        const { safe } = ready({ ...base, today })
        const plan = checkInPlan(safe.dueEntries, today)
        // The bank now shows those bills gone. The user says yes to the manual ones too.
        const gone = [...plan.autoPaid, ...plan.ask]
        const at = `${today}T23:00:00.000Z`
        const marked = gone.map((e) => ({
          id: occurrenceId(e.billId, e.originalDate),
          billId: e.billId,
          originalDate: e.originalDate,
          ...paidFields(e.override, e.amount, at, e.autopay),
        }))
        const ids = new Set(marked.map((m) => m.id))
        const after = totalOf({
          ...base,
          today,
          checkIn: {
            at,
            date: today,
            balance: safe.currentBalance - sum(gone.map((e) => e.amount)),
          },
          occurrences: [...base.occurrences.filter((o) => !ids.has(o.id)), ...marked],
        })
        expect(after).toBe(safe.total)
      }),
    )
  })

  it('an envelope-linked bill is counted once', () => {
    fc.assert(
      fc.property(
        arbWorld,
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 1, max: 28 }),
        ({ base, today }, amount, day) => {
          const world = { ...base, today, envelopesEnabled: true }
          const before = totalOf(world)
          const linked = monthly('lnk', 'Linked', amount, day, { envelopeId: 'food' })
          const plan = ready({ ...world, bills: [...base.bills, linked] })
          const n = plan.safe.dueEntries.filter((e) => e.billId === 'lnk').length
          // It lowers the total by at most its own amount per occurrence, never twice...
          expect(plan.safe.total).toBeGreaterThanOrEqual(before - n * amount)
          expect(plan.safe.total).toBeLessThanOrEqual(before)
          // ...and paying it changes nothing.
          const at = `${today}T23:30:00.000Z`
          const paid = plan.safe.dueEntries
            .filter((e) => e.billId === 'lnk')
            .map((e) => ({
              id: occurrenceId(e.billId, e.originalDate),
              billId: e.billId,
              originalDate: e.originalDate,
              ...paidFields(undefined, e.amount, at),
            }))
          const afterPaid = totalOf({
            ...world,
            bills: [...base.bills, linked],
            occurrences: [...base.occurrences, ...paid],
          })
          expect(afterPaid).toBe(plan.safe.total)
        },
      ),
    )
  })

  it('a savings contribution never raises it', () => {
    fc.assert(
      fc.property(arbWorld, fc.integer({ min: 1, max: 50000 }), ({ base, today }, amount) => {
        fc.pre((base.funds ?? []).length > 0)
        // Made now, so it leaves the balance. (Logging an OLD transfer that is already
        // in the balance may raise it, correctly: the target was met all along.)
        const contribution: Transaction = {
          id: 'save',
          date: today,
          amount: -amount,
          note: 'savings',
          fundId: 'f0',
          createdAt: `${today}T23:59:00.000Z`,
        }
        expect(
          totalOf({ ...base, today, transactions: [...base.transactions, contribution] }),
        ).toBeLessThanOrEqual(totalOf({ ...base, today }))
      }),
    )
  })
})

describe('ticking a bill paid (review)', () => {
  it('never moves the total when nothing new left the bank, history included', () => {
    fc.assert(
      fc.property(arbWorld, fc.nat(), fc.nat(), ({ base, today }, addedPick, pick) => {
        // Bills entered the app on random days, so some dates are history (PLAN M4).
        const bills = base.bills.map((b, i) => ({
          ...b,
          createdAt: `${addDays(today, -((addedPick >> i) % 60))}T09:00:00.000Z`,
        }))
        const world = {
          ...base,
          today,
          bills,
          envelopesEnabled: false,
          addedOn: addedOnMap(bills, (at) => at.slice(0, 10)),
        }
        const plan = ready(world)
        const unpaid = billEntriesBetween(
          bills,
          base.occurrences,
          addDays(today, -90),
          plan.period.end,
        ).filter((e) => e.status === 'due')
        fc.pre(unpaid.length > 0)
        const e = unpaid[pick % unpaid.length]!
        const counted = plan.safe.dueEntries.some(
          (d) => d.billId === e.billId && d.originalDate === e.originalDate,
        )
        const history = e.date < world.addedOn.get(e.billId)!
        fc.pre(counted || history)
        const id = occurrenceId(e.billId, e.originalDate)
        const after = totalOf({
          ...world,
          occurrences: [
            ...base.occurrences.filter((o) => o.id !== id),
            {
              id,
              billId: e.billId,
              originalDate: e.originalDate,
              ...paidFields(e.override, e.amount, `${today}T23:30:00.000Z`),
            },
          ],
        })
        // A counted bill moves from "bills due" to "paid since"; a history one was never
        // owed, so ticking it for the record changes nothing either.
        expect(after).toBe(plan.safe.total)
      }),
    )
  })
})
