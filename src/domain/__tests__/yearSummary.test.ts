import { describe, expect, it } from 'vitest'
import type { Bill, BillOccurrence, Debt, SavingsFund, Transaction } from '../types'
import { debtsInRange, fundsInRange } from '../yearSummary'

const YEAR = { start: '2026-01-01', end: '2027-01-01' }

let n = 0
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`,
  date,
  amount,
  note: '',
  createdAt: `${date}T10:00:00.000Z`,
  ...extra,
})

describe('fundsInRange', () => {
  const holiday: SavingsFund = {
    id: 'h',
    name: 'Holiday',
    target: 100000,
    perPeriod: 5000,
    openingSaved: 10000,
  }
  const rainy: SavingsFund = { id: 'r', name: 'Rainy day', perPeriod: 0, openingSaved: 0 }

  it('splits this year from the total and shows the share of the target', () => {
    const rows = fundsInRange(
      [holiday, rainy, { ...rainy, id: 'x', deletedAt: '2026-02-01T00:00:00.000Z' }],
      [
        tx('2025-12-20', -5000, { fundId: 'h' }),
        tx('2026-03-01', -20000, { fundId: 'h' }),
        tx('2026-04-01', 5000, { fundId: 'h' }),
        tx('2026-05-01', -3000, { fundId: 'r' }),
        tx('2026-05-02', -9999, { fundId: 'h', deletedAt: '2026-05-02T11:00:00.000Z' }),
      ],
      YEAR,
    )
    expect(rows).toEqual([
      {
        id: 'h',
        name: 'Holiday',
        savedInRange: 15000,
        savedTotal: 30000,
        target: 100000,
        ofTarget: 0.3,
      },
      { id: 'r', name: 'Rainy day', savedInRange: 3000, savedTotal: 3000, ofTarget: null },
    ])
  })
})

describe('debtsInRange', () => {
  const debt = (id: string, balance: number, aprBps: number): Debt => ({
    id,
    name: id,
    balance,
    balanceAsOf: '2026-06-01',
    originalBalance: balance * 2,
    aprBps,
    minPayment: 5000,
    dueDay: 15,
  })
  const min: Bill = {
    id: 'card-min',
    name: 'card',
    amount: 5000,
    rule: { freq: 'monthly', interval: 1, day: 15, anchor: '2026-01-15' },
    debtId: 'card',
    autopay: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  const paid = (date: string): BillOccurrence => ({
    id: `card-min|${date}`,
    billId: 'card-min',
    originalDate: date,
    status: 'paid',
    paidAt: `${date}T09:00:00.000Z`,
  })

  it('adds paid minimums and logged payments, once each, and weights the APR by balance', () => {
    const out = debtsInRange(
      [debt('card', 100000, 2000), debt('car', 300000, 600)],
      [min],
      [paid('2026-01-15'), paid('2026-02-15')],
      [
        tx('2026-03-01', -2500, { debtId: 'card' }),
        // The February minimum logged as an entry too: it is that bill, not more.
        tx('2026-02-15', -5000, { debtId: 'card', billOccurrenceId: 'card-min|2026-02-15' }),
      ],
      YEAR,
      '2026-07-02',
    )
    expect(out.rows.map((r) => [r.id, r.paidInRange, r.owed])).toEqual([
      ['card', 12500, 100000],
      ['car', 0, 300000],
    ])
    expect(out.paid).toBe(12500)
    expect(out.owed).toBe(400000)
    // (100000 × 20% + 300000 × 6%) / 400000 = 9.5%
    expect(out.avgAprBps).toBe(950)
    // A year's interest at today's balances is 38 000; 182 of 365 days have gone.
    expect(out.interestEstimate).toBe(Math.round(38000 * (182 / 365)))
  })

  it('has no average APR when nothing is owed', () => {
    const out = debtsInRange([debt('card', 0, 2000)], [], [], [], YEAR, '2026-07-02')
    expect(out.avgAprBps).toBeNull()
    expect(out.interestEstimate).toBe(0)
  })
})
