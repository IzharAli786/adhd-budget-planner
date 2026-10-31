import { describe, expect, it } from 'vitest'
import type { BillEntry } from '../bills'
import {
  askIfInBalance,
  checkInPlan,
  countedTransactions,
  isCounted,
  isSpend,
  lookbackStart,
  paidSinceCheckIn,
  paydaySinceCheckIn,
} from '../reconcile'
import type { Bill, BillOccurrence, Transaction } from '../types'

const checkIn = { at: '2026-11-02T09:00:00.000Z', date: '2026-11-02', balance: 100000 }
const tx = (extra: Partial<Transaction>): Transaction => ({
  id: 't',
  date: '2026-11-02',
  amount: -500,
  note: '',
  createdAt: '2026-11-02T10:00:00.000Z',
  ...extra,
})

describe('isCounted', () => {
  it.each<[string, Partial<Transaction>, boolean]>([
    ['entered after the check-in', {}, true],
    ['entered before it', { createdAt: '2026-11-02T08:59:59.999Z' }, false],
    ['entered at the same instant', { createdAt: checkIn.at }, false],
    ['already in the bank balance', { inBalance: true }, false],
    ['deleted', { deletedAt: '2026-11-03T00:00:00.000Z' }, false],
    // The DATE does not decide: a backdated entry made after the check-in still counts
    // unless the user said it was already in the balance.
    ['backdated but entered after', { date: '2026-10-20' }, true],
  ])('%s', (_, extra, expected) => {
    expect(isCounted(tx(extra), checkIn)).toBe(expected)
  })

  it('countedTransactions keeps only counted ones', () => {
    const rows = [tx({ id: 'a' }), tx({ id: 'b', inBalance: true })]
    expect(countedTransactions(rows, checkIn).map((t) => t.id)).toEqual(['a'])
  })
})

describe('askIfInBalance', () => {
  it.each([
    ['2026-11-01', true],
    ['2026-11-02', false],
    ['2026-11-03', false],
  ])('dated %s -> %s', (date, expected) => {
    expect(askIfInBalance(date, checkIn)).toBe(expected)
  })
  it('never asks before the first check-in', () => {
    expect(askIfInBalance('2020-01-01', undefined)).toBe(false)
  })
})

describe('isSpend', () => {
  it.each<[Partial<Transaction>, boolean]>([
    [{ amount: -500 }, true],
    [{ amount: 500 }, false],
    [{ amount: -500, fundId: 'f' }, false],
    [{ amount: -500, billOccurrenceId: 'b|2026-11-01' }, false],
  ])('%j -> %s', (extra, expected) => expect(isSpend(tx(extra))).toBe(expected))
})

describe('paidSinceCheckIn', () => {
  const bills = [{ id: 'rent', name: 'Rent', amount: 95000 } as Bill]
  const occ = (extra: Partial<BillOccurrence>): BillOccurrence => ({
    id: 'rent|2026-11-01',
    billId: 'rent',
    originalDate: '2026-11-01',
    status: 'paid',
    paidAmount: 90000,
    paidAt: '2026-11-03T10:00:00.000Z',
    ...extra,
  })

  it('counts bills ticked paid after the check-in, at the paid amount', () => {
    expect(paidSinceCheckIn([occ({})], bills, [], checkIn)).toEqual([
      { billId: 'rent', originalDate: '2026-11-01', name: 'Rent', amount: 90000 },
    ])
  })
  it.each<[string, Partial<BillOccurrence>]>([
    ['paid before the check-in', { paidAt: '2026-11-01T10:00:00.000Z' }],
    ['marked paid BY the check-in (autopay)', { paidAt: checkIn.at, auto: true }],
    ['skipped', { status: 'skipped' }],
    ['only moved', { status: 'moved', movedTo: '2026-11-05' }],
  ])('ignores one %s', (_, extra) => {
    expect(paidSinceCheckIn([occ(extra)], bills, [], checkIn)).toEqual([])
  })
  it('leaves a payment to a linked transaction (no double count)', () => {
    const linked = tx({ billOccurrenceId: 'rent|2026-11-01', amount: -90000 })
    expect(paidSinceCheckIn([occ({})], bills, [linked], checkIn)).toEqual([])
  })
})

describe('lookbackStart / paydaySinceCheckIn', () => {
  it('takes the earlier of the check-in and the payday before it', () => {
    expect(lookbackStart('2026-11-02', '2026-10-30')).toBe('2026-10-30')
    expect(lookbackStart('2026-11-02', null)).toBe('2026-11-02')
  })
  it('a payday after the check-in day means the pay is missing', () => {
    expect(paydaySinceCheckIn('2026-11-30', '2026-11-20')).toBe(true)
    expect(paydaySinceCheckIn('2026-10-30', '2026-11-02')).toBe(false)
    expect(paydaySinceCheckIn('2026-11-02', '2026-11-02')).toBe(false)
  })
})

describe('checkInPlan', () => {
  const entry = (
    billId: string,
    date: string,
    autopay: boolean,
    status: BillEntry['status'] = 'due',
  ) =>
    ({
      billId,
      originalDate: date,
      date,
      amount: 1000,
      status,
      moved: false,
      name: billId,
      autopay,
    }) as BillEntry

  it('autopay on or before the check-in is auto-paid; manual ones are asked about', () => {
    const plan = checkInPlan(
      [
        entry('phone', '2026-11-01', true),
        entry('gym', '2026-11-02', false),
        entry('stream', '2026-11-02', true),
        entry('later', '2026-11-03', true),
        entry('later2', '2026-11-03', false),
        entry('done', '2026-11-01', true, 'paid'),
      ],
      '2026-11-02',
    )
    expect(plan.autoPaid.map((e) => e.billId)).toEqual(['phone', 'stream'])
    expect(plan.ask.map((e) => e.billId)).toEqual(['gym'])
  })
})
