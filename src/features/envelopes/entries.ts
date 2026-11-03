// What one envelope holds in one month: the logged entries and the bills linked to it.
// The same rules as its numbers (envelopesUsage in safeToSpend.ts), so the rows on a card
// always add up to the "spent" figure above them.
import { billEntriesBetween, type BillEntry } from '../../domain/bills'
import { envelopeHome, txKind, type DateSpan } from '../../domain/safeToSpend'
import type { Bill, BillOccurrence, Envelope, Id, Transaction } from '../../domain/types'

/**
 * Spending and refunds dated in `span` whose home is this envelope, oldest first.
 * Untagged spending belongs to the default envelope (Everyday); moves into savings, debt
 * payments and bill payment rows are never envelope entries.
 */
export function envelopeEntries(
  envelope: Pick<Envelope, 'id'>,
  envelopes: readonly Pick<Envelope, 'id' | 'isDefault'>[],
  transactions: readonly Transaction[],
  span: DateSpan,
): Transaction[] {
  return transactions
    .filter((t) => {
      if (t.deletedAt !== undefined || t.date < span.start || t.date >= span.end) return false
      const k = txKind(t)
      return (k === 'expense' || k === 'refund') && envelopeHome(t, envelopes) === envelope.id
    })
    .sort((a, b) =>
      a.date === b.date ? (a.createdAt < b.createdAt ? -1 : 1) : a.date < b.date ? -1 : 1,
    )
}

/** Bills linked to this envelope that land in `span`, skipped and debt bills left out. */
export function linkedBillEntries(
  envelopeId: Id,
  bills: readonly Bill[],
  occurrences: readonly BillOccurrence[],
  span: DateSpan,
): BillEntry[] {
  const mine = bills.filter((b) => b.envelopeId === envelopeId && b.deletedAt === undefined)
  return billEntriesBetween(mine, occurrences, span.start, span.end).filter(
    (e) => e.debtId === undefined && e.status !== 'skipped',
  )
}
