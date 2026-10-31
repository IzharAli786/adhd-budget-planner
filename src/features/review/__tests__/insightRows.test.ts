import { describe, expect, it } from 'vitest'
import type { Bill, BillOccurrence, Envelope, Transaction } from '../../../domain/types'
import { envelopeColor } from '../../../ui/EnvelopeDot'
import { insightRows } from '../insightRows'
import type { ReviewData } from '../useReviewData'

const range = { start: '2026-10-01', end: '2026-10-15' }
const envelopes: Envelope[] = [
  { id: 'every', name: 'Everyday', budget: 3000, isDefault: true, color: 'accent', sort: 0 },
  { id: 'food', name: 'Groceries', budget: 20000, isDefault: false, color: 'sage', sort: 1 },
  // A colour from an edited backup: the list shows it in the accent, so must the chart.
  { id: 'odd', name: 'Odd', budget: 1000, isDefault: false, color: '#ff0000', sort: 2 },
]
const spend = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id,
  date: '2026-10-03',
  amount,
  note: id,
  createdAt: '2026-10-03T10:00:00.000Z',
  ...extra,
})
const phone: Bill = {
  id: 'phone',
  name: 'Phone',
  amount: 2500,
  rule: { freq: 'monthly', interval: 1, day: 5, anchor: '2026-01-05' },
  autopay: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}
const paid: BillOccurrence = {
  id: 'phone|2026-10-05',
  billId: 'phone',
  originalDate: '2026-10-05',
  status: 'paid',
  paidAmount: 2500,
}

function data(bills: Bill[], occurrences: BillOccurrence[]): ReviewData {
  const transactions = [
    spend('a', -1500, { envelopeId: 'food' }),
    spend('b', -400, { envelopeId: 'odd' }),
    spend('c', -5000, { debtId: 'card' }),
  ]
  return {
    input: {
      today: '2026-10-14',
      incomes: [],
      paydayOverrides: [],
      bills,
      occurrences,
      transactions,
      checkIns: [],
    },
    envelopes,
    envelopesEnabled: true,
    funds: [],
    debts: [],
    bills,
    occurrences,
    transactions,
  }
}

describe('insightRows colours', () => {
  it('gives envelope rows the same colour as the envelope list', () => {
    const rows = insightRows(data([], []), range)
    for (const e of envelopes)
      expect(rows.find((r) => r.key === e.id)!.color).toBe(envelopeColor(e.color))
  })

  it('keeps Debt one colour whether or not a Bills row is shown beside it', () => {
    const withBills = insightRows(data([phone], [paid]), range)
    const without = insightRows(data([], []), range)
    expect(withBills.some((r) => r.key === 'bills')).toBe(true)
    expect(without.some((r) => r.key === 'bills')).toBe(false)
    const debt = (rows: typeof without) => rows.find((r) => r.key === 'debt')!.color
    expect(debt(withBills)).toBe(debt(without))
    expect(debt(without)).not.toBe(withBills.find((r) => r.key === 'bills')!.color)
  })
})
