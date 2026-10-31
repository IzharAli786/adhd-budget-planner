import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  spendByCategory,
  spendByEnvelope,
  topCategories,
  type DateRange,
  type EnvelopeSpend,
} from '../insights'
import type { Bill, BillOccurrence, Envelope, SavingsFund, Transaction } from '../types'

const PERIOD: DateRange = { start: '2026-10-30', end: '2026-11-30' }

const env = (id: string, budget: number, isDefault = false): Envelope => ({
  id,
  name: id,
  budget,
  isDefault,
  color: 'accent',
  sort: 0,
})

let n = 0
const tx = (amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`,
  date: '2026-11-04',
  amount,
  note: '',
  createdAt: '2026-11-04T10:00:00.000Z',
  ...extra,
})

const bill = (id: string, amount: number, date: string, extra: Partial<Bill> = {}): Bill => ({
  id,
  name: id,
  amount,
  rule: { freq: 'once', date },
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})

const paid = (b: Bill, paidAmount?: number): BillOccurrence => ({
  id: `${b.id}|${(b.rule as { date: string }).date}`,
  billId: b.id,
  originalDate: (b.rule as { date: string }).date,
  status: 'paid',
  paidAt: '2026-11-10T10:00:00.000Z',
  ...(paidAmount !== undefined ? { paidAmount } : {}),
})

const ENVS = [env('everyday', 20000, true), env('food', 30000)]
const actualOf = (rows: EnvelopeSpend[], id: string | null) =>
  rows.find((r) => r.envelopeId === id)?.actual

describe('spendByEnvelope', () => {
  it.each([
    // label, transactions -> everyday, food
    ['nothing', [], 0, 0],
    ['untagged spending goes to the default', [tx(-1200)], 1200, 0],
    ['tagged spending goes to its envelope', [tx(-4000, { envelopeId: 'food' })], 0, 4000],
    [
      'a deleted envelope tag falls back to the default',
      [tx(-500, { envelopeId: 'gone' })],
      500,
      0,
    ],
    ['untagged income is not an envelope’s money', [tx(210000), tx(-300)], 300, 0],
    [
      'a tagged refund lowers the envelope',
      [tx(-4000, { envelopeId: 'food' }), tx(1000, { envelopeId: 'food' })],
      0,
      3000,
    ],
    [
      'savings, debt and bill payments are not spending',
      [
        tx(-5000, { fundId: 'f' }),
        tx(-5000, { debtId: 'd' }),
        tx(-5000, { billOccurrenceId: 'b|2026-11-01' }),
      ],
      0,
      0,
    ],
    [
      'outside the period',
      [tx(-700, { date: '2026-11-30' }), tx(-700, { date: '2026-10-29' })],
      0,
      0,
    ],
    ['deleted rows', [tx(-700, { deletedAt: '2026-11-05T00:00:00.000Z' })], 0, 0],
  ] as const)('%s', (_, txs, everyday, food) => {
    const rows = spendByEnvelope(txs, [], [], ENVS, PERIOD)
    expect(actualOf(rows, 'everyday')).toBe(everyday)
    expect(actualOf(rows, 'food')).toBe(food)
    expect(rows.map((r) => r.planned)).toEqual([20000, 30000])
  })

  it('counts a paid bill linked to an envelope as actual, an unpaid one not yet', () => {
    const box = bill('box', 4000, '2026-11-05', { envelopeId: 'food' })
    const later = bill('later', 2500, '2026-11-20', { envelopeId: 'food' })
    const rent = bill('rent', 90000, '2026-11-01')
    const rows = spendByEnvelope(
      [],
      [paid(box, 4200), paid(rent)],
      [box, later, rent],
      ENVS,
      PERIOD,
    )
    expect(actualOf(rows, 'food')).toBe(4200)
    expect(actualOf(rows, 'everyday')).toBe(0)
  })

  it('puts spending with no default envelope under Unsorted', () => {
    const rows = spendByEnvelope([tx(-900)], [], [], [env('food', 100)], PERIOD)
    expect(rows.at(-1)).toEqual({ envelopeId: null, name: 'Unsorted', planned: 0, actual: 900 })
  })

  it('never splits more or less than the everyday spending (property)', () => {
    const arb = fc.array(
      fc.record({
        amount: fc.integer({ min: -50000, max: -1 }),
        envelopeId: fc.constantFrom(undefined, 'everyday', 'food', 'gone'),
        day: fc.integer({ min: 1, max: 28 }),
      }),
    )
    fc.assert(
      fc.property(arb, (specs) => {
        const txs = specs.map((s) =>
          tx(s.amount, {
            date: `2026-11-${String(s.day).padStart(2, '0')}`,
            ...(s.envelopeId ? { envelopeId: s.envelopeId } : {}),
          }),
        )
        const rows = spendByEnvelope(txs, [], [], ENVS, PERIOD)
        const total = rows.reduce((a, r) => a + r.actual, 0)
        expect(total).toBe(0 - txs.reduce((a, t) => a + t.amount, 0))
      }),
    )
  })
})

describe('spendByCategory (envelopes off)', () => {
  const debtMin = bill('card', 5000, '2026-11-15', { debtId: 'card' })
  const rent = bill('rent', 90000, '2026-11-01')
  const phone = bill('phone', 2000, '2026-11-20')
  const fund: SavingsFund = { id: 'f', name: 'Rainy day', perPeriod: 5000, openingSaved: 0 }

  it('groups money out into everyday, bills, savings and debt', () => {
    const rows = spendByCategory(
      [
        tx(-1200),
        tx(-800),
        tx(-5000, { fundId: 'f' }),
        tx(1000, { fundId: 'f' }),
        tx(-2500, { debtId: 'x' }),
      ],
      [paid(rent), paid(debtMin)],
      [rent, phone, debtMin],
      [fund],
      PERIOD,
    )
    expect(rows).toEqual([
      { id: 'everyday', name: 'Everyday', planned: null, actual: 2000 },
      { id: 'bills', name: 'Bills', planned: 92000, actual: 90000 },
      { id: 'savings', name: 'Savings', planned: 5000, actual: 4000 },
      { id: 'debt', name: 'Debt payments', planned: 5000, actual: 7500 },
    ])
  })

  it('counts a debt minimum paid through a logged entry once', () => {
    const rows = spendByCategory(
      [tx(-5000, { debtId: 'card', billOccurrenceId: 'card|2026-11-15' })],
      [paid(debtMin)],
      [debtMin],
      [],
      PERIOD,
    )
    expect(rows.find((r) => r.id === 'debt')!.actual).toBe(5000)
  })

  it('scales the savings plan by the number of pay periods', () => {
    const rows = spendByCategory([], [], [], [fund], PERIOD, 12)
    expect(rows.find((r) => r.id === 'savings')!.planned).toBe(60000)
  })
})

describe('topCategories', () => {
  const rows = (xs: number[]) => xs.map((actual, i) => ({ id: i, actual }))

  it.each([
    ['empty', [], 6, [], 0, 0],
    ['zeros are left out', [0, 300, 0], 6, [300], 0, 300],
    ['sorted largest first', [100, 300, 200], 6, [300, 200, 100], 0, 600],
    ['the rest is rolled up so slices stay at the limit', [1, 2, 3, 4, 5], 3, [5, 4], 6, 15],
    ['exactly the limit needs no rest', [1, 2, 3], 3, [3, 2, 1], 0, 6],
  ])('%s', (_, xs, limit, top, rest, total) => {
    const out = topCategories(rows(xs), limit)
    expect(out.top.map((s) => s.row.actual)).toEqual(top)
    expect(out.rest).toBe(rest)
    expect(out.total).toBe(total)
  })

  it('shares add up to 1 with the rest (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { maxLength: 20 }),
        fc.integer({ min: 2, max: 8 }),
        (xs, limit) => {
          const out = topCategories(rows(xs), limit)
          expect(out.top.length + (out.rest > 0 ? 1 : 0)).toBeLessThanOrEqual(limit)
          if (out.total === 0) return
          const shares = out.top.reduce((a, s) => a + s.share, 0) + out.rest / out.total
          expect(shares).toBeCloseTo(1, 9)
        },
      ),
    )
  })
})
