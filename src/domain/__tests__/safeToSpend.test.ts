// The pay-based money model (PLAN-v2 locked decisions A, A2, C):
//   safe to spend = carried in + income − bills − expenses − cushion
// with savings and debt walled off.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  balanceAt,
  monthSpan,
  safeToSpend,
  simpleLines,
  txKind,
  type LedgerInput,
} from '../safeToSpend'
import type { Bill, Envelope, IncomeSource, Transaction } from '../types'

const NOV = monthSpan('2026-11-10')

const pay: IncomeSource = {
  id: 'pay',
  name: 'Pay',
  amount: 200000,
  schedule: { kind: 'monthly', day: 15 },
  weekendRule: 'none',
  primary: true,
  active: true,
}

const bill = (id: string, amount: number, day: number, extra: Partial<Bill> = {}): Bill => ({
  id,
  name: id,
  amount,
  rule: { freq: 'monthly', interval: 1, day, anchor: '2026-01-01' },
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

let n = 0
const tx = (
  amount: number,
  date = '2026-11-05',
  extra: Partial<Transaction> = {},
): Transaction => ({
  id: `t${++n}`,
  date,
  amount,
  note: '',
  createdAt: `${date}T10:00:00.000Z`,
  ...extra,
})

const env = (id: string, budget: number, isDefault = false): Envelope => ({
  id,
  name: id,
  budget,
  isDefault,
  color: 'clay',
  sort: 0,
})

const base: LedgerInput = {
  today: '2026-11-10',
  period: NOV,
  start: { date: '2026-11-01', balance: 0 },
  rollover: false,
  incomes: [pay],
  paydayOverrides: [],
  bills: [bill('rent', 100000, 1), bill('phone', 3000, 20)],
  occurrences: [],
  transactions: [],
}

describe('txKind', () => {
  it.each([
    [{ amount: -500 }, 'expense'],
    [{ amount: 500 }, 'income'],
    [{ amount: 500, envelopeId: 'food' }, 'refund'],
    [{ amount: -500, fundId: 'f' }, 'saving'],
    [{ amount: -500, debtId: 'd' }, 'debt'],
    [{ amount: -500, billOccurrenceId: 'x|2026-11-01' }, 'billPayment'],
  ] as const)('%o is %s', (t, kind) => expect(txKind(t)).toBe(kind))
})

describe('safe to spend = income − bills − expenses', () => {
  it('counts the payday, every bill (paid or not) and spending in the month', () => {
    const r = safeToSpend({ ...base, transactions: [tx(-2500), tx(-1000, '2026-11-25')] })
    expect(r.income).toBe(200000)
    expect(r.bills).toBe(103000)
    expect(r.billsPending).toBe(103000)
    expect(r.expenses).toBe(3500)
    expect(r.total).toBe(200000 - 103000 - 3500)
  })

  it('ticking a bill paid never moves the number', () => {
    const paid = safeToSpend({
      ...base,
      occurrences: [
        {
          id: 'rent|2026-11-01',
          billId: 'rent',
          originalDate: '2026-11-01',
          status: 'paid',
          paidAmount: 100000,
        },
      ],
    })
    expect(paid.total).toBe(safeToSpend(base).total)
    expect(paid.billsPaid).toBe(100000)
    expect(paid.billsPending).toBe(3000)
  })

  it('a skipped bill does not count', () => {
    const r = safeToSpend({
      ...base,
      occurrences: [
        { id: 'phone|2026-11-20', billId: 'phone', originalDate: '2026-11-20', status: 'skipped' },
      ],
    })
    expect(r.bills).toBe(100000)
  })

  it('logged income adds; a refund into an envelope lowers spending instead', () => {
    const r = safeToSpend({
      ...base,
      transactions: [tx(5000), tx(-4000), tx(1000, '2026-11-06', { envelopeId: 'food' })],
    })
    expect(r.income).toBe(205000)
    expect(r.expenses).toBe(3000)
  })

  it('the cushion comes off the total', () => {
    expect(safeToSpend({ ...base, buffer: 5000 }).total).toBe(safeToSpend(base).total - 5000)
  })

  it('reads "short" below zero', () => {
    expect(safeToSpend({ ...base, incomes: [] }).status).toBe('short')
  })

  it('the lines always add up to the total, and so do the simple lines', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(fc.integer({ min: -50000, max: 50000 }), fc.integer({ min: 1, max: 30 })),
        ),
        fc.integer({ min: -100000, max: 100000 }),
        fc.integer({ min: 0, max: 10000 }),
        (rows, balance, buffer) => {
          const transactions = rows.map(([a, d]) => tx(a, `2026-11-${String(d).padStart(2, '0')}`))
          const r = safeToSpend({
            ...base,
            transactions,
            buffer,
            start: { date: '2026-11-01', balance },
          })
          expect(r.lines.reduce((a, l) => a + l.amount, 0)).toBe(r.total)
          expect(
            simpleLines(r)
              .slice(0, 3)
              .reduce((a, l) => a + l.amount, 0),
          ).toBe(r.total)
        },
      ),
    )
  })
})

describe('savings and debt are walled off (A2)', () => {
  it('moving money into savings or paying a debt never changes safe to spend', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1_000_000 }),
        fc.integer({ min: 1, max: 1_000_000 }),
        (s, d) => {
          const r = safeToSpend({
            ...base,
            transactions: [
              tx(-s, '2026-11-03', { fundId: 'f' }),
              tx(-d, '2026-11-04', { debtId: 'd' }),
            ],
          })
          expect(r.total).toBe(safeToSpend(base).total)
          expect(r.income).toBe(200000)
          expect(r.expenses).toBe(0)
          expect(r.savingsMoved).toBe(s)
          expect(r.debtPaid).toBe(d)
        },
      ),
    )
  })

  it('a debt minimum bill is not a bill here; paid, it counts as debt paid', () => {
    const minimum = bill('card', 9500, 11, { debtId: 'd' })
    const r = safeToSpend({
      ...base,
      bills: [...base.bills, minimum],
      occurrences: [
        {
          id: 'card|2026-11-11',
          billId: 'card',
          originalDate: '2026-11-11',
          status: 'paid',
          paidAmount: 9500,
        },
      ],
    })
    expect(r.bills).toBe(103000)
    expect(r.debtPaid).toBe(9500)
  })
})

describe('starting balance and roll over (C)', () => {
  it('the starting balance is added to the first period only', () => {
    const start = { date: '2026-11-01', balance: 50000 }
    expect(safeToSpend({ ...base, start }).total).toBe(safeToSpend(base).total + 50000)
    const dec = safeToSpend({
      ...base,
      start,
      today: '2026-12-10',
      period: monthSpan('2026-12-01'),
    })
    expect(dec.carriedIn).toBe(0)
  })

  it('with roll over on, last month’s leftover carries in', () => {
    const start = { date: '2026-11-01', balance: 50000 }
    const nov = safeToSpend({ ...base, start, today: '2026-12-10' })
    const dec = safeToSpend({
      ...base,
      start,
      rollover: true,
      today: '2026-12-10',
      period: monthSpan('2026-12-01'),
    })
    expect(dec.carriedIn).toBe(nov.total)
    expect(balanceAt({ ...base, start }, '2026-12-01')).toBe(nov.total)
  })

  it('money from before the start date is already in the starting balance', () => {
    const r = safeToSpend({
      ...base,
      start: { date: '2026-11-10', balance: 70000 },
      transactions: [tx(-9999, '2026-11-05'), tx(-100, '2026-11-12')],
    })
    // Rent on the 1st and spending on the 5th are before the start: not counted again.
    expect(r.bills).toBe(3000)
    expect(r.expenses).toBe(100)
    expect(r.total).toBe(70000 + 200000 - 3000 - 100)
  })
})

describe('envelopes: budget vs actual', () => {
  const input: LedgerInput = {
    ...base,
    envelopesEnabled: true,
    envelopes: [env('everyday', 20000, true), env('food', 30000), env('home', 100000)],
    bills: [
      bill('rent', 100000, 1, { envelopeId: 'home' }),
      bill('box', 4000, 20, { envelopeId: 'food' }),
    ],
  }

  it('untagged spending lands in Everyday, tagged in its envelope, future-dated as still coming', () => {
    const r = safeToSpend({
      ...input,
      transactions: [
        tx(-500),
        tx(-700, '2026-11-06', { envelopeId: 'food' }),
        tx(-300, '2026-11-25', { envelopeId: 'food' }),
      ],
    })
    const by = Object.fromEntries(r.envelopes.map((e) => [e.id, e]))
    expect(by.everyday!.spent).toBe(500)
    expect(by.food!.spent).toBe(700)
    expect(by.food!.linkedDue).toBe(300 + 4000)
    expect(by.food!.reserved).toBe(30000 - 700 - 4300)
    expect(by.home!.spent).toBe(100000)
    expect(by.home!.reserved).toBe(0)
  })

  it('budgets never hold money back from safe to spend', () => {
    expect(safeToSpend(input).total).toBe(safeToSpend({ ...input, envelopesEnabled: false }).total)
  })

  it('over budget is reported, never with no budget set', () => {
    const r = safeToSpend({
      ...input,
      envelopes: [env('everyday', 0, true), env('food', 1000)],
      transactions: [tx(-5000), tx(-1500, '2026-11-06', { envelopeId: 'food' })],
    })
    expect(r.envelopes.find((e) => e.id === 'everyday')!.over).toBe(0)
    expect(r.envelopes.find((e) => e.id === 'food')!.over).toBe(4500)
  })
})
