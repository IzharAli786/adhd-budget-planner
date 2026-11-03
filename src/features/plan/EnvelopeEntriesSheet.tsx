import { useState } from 'react'
import { Link } from 'react-router'
import { AddEntrySheet } from '../bills/AddEntrySheet'
import { EntryRow } from '../transactions/EntryRow'
import { TransactionSheet } from '../transactions/TransactionsScreen'
import { useTransactions } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import type { DateRange } from '../../domain/insights'
import { envelopeHome, txKind, type EnvelopeUsage } from '../../domain/safeToSpend'
import type { Envelope, ISODate, Transaction } from '../../domain/types'
import { Button, buttonClass } from '../../ui/Button'
import { EnvelopeDot } from '../../ui/EnvelopeDot'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

interface Props {
  envelope: Envelope | null
  envelopes: readonly Envelope[]
  usage: EnvelopeUsage | undefined
  period: DateRange
  today: ISODate
  onClose: () => void
}

/**
 * The entries that count against one envelope this pay period: the same rule as its
 * "left" number (envelopeUsage in safeToSpend.ts), so the list always adds up to it.
 * Untagged spending belongs to Everyday; moves into savings and paid bills are not
 * entries here (a bill linked to the envelope is shown as one total line).
 */
export function envelopeEntries(
  envelope: Envelope,
  envelopes: readonly Envelope[],
  transactions: readonly Transaction[],
  period: DateRange,
): Transaction[] {
  return transactions
    .filter((t) => {
      if (t.deletedAt !== undefined || t.date < period.start || t.date >= period.end) return false
      const k = txKind(t)
      return (k === 'expense' || k === 'refund') && envelopeHome(t, envelopes) === envelope.id
    })
    .sort((a, b) =>
      a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1,
    )
}

/** Tap an envelope on Plan: what went into it this pay period, newest first. */
export function EnvelopeEntriesSheet({
  envelope,
  envelopes,
  usage,
  period,
  today,
  onClose,
}: Props) {
  const f = useFormat()
  const transactions = useTransactions(period.start, addDays(period.end, -1))
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [adding, setAdding] = useState(false)
  const entries =
    envelope && transactions ? envelopeEntries(envelope, envelopes, transactions, period) : []
  const total = -entries.reduce((sum, t) => sum + t.amount, 0)
  // usage also counts bills linked to this envelope.
  const fromBills = usage ? usage.spent + usage.linkedDue - total : 0
  const range = `${f.day(period.start)} – ${f.day(addDays(period.end, -1))}`
  // Everyday holds every untagged entry, so its log is the whole period; others filter.
  const logLink = envelope?.isDefault
    ? '/more/transactions'
    : `/more/transactions?envelope=${encodeURIComponent(envelope?.id ?? '')}`

  return (
    <Sheet
      open={envelope !== null}
      onClose={onClose}
      title={envelope?.name ?? ''}
      description={range}
    >
      {envelope && (
        <div className="space-y-4 pb-4">
          <div className="flex items-center gap-3 rounded-2xl bg-bg px-4 py-3">
            <EnvelopeDot color={envelope.color} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">Actual this period</p>
              <p className="text-heading tabular-nums">{f.money(total + fromBills)}</p>
            </div>
            {envelope.budget > 0 && usage && (
              <p className="text-right text-sm text-muted tabular-nums">
                {usage.over > 0
                  ? `${f.money(usage.over)} past the plan`
                  : `${f.money(usage.reserved)} left`}
                <br />
                of {f.money(envelope.budget)}
              </p>
            )}
          </div>
          {transactions === undefined ? (
            <div aria-hidden="true" className="h-24 animate-pulse rounded-2xl bg-bg" />
          ) : entries.length === 0 && fromBills === 0 ? (
            <p className="rounded-2xl bg-bg px-4 py-3 text-body text-muted">
              Nothing here yet this pay period.
              {!envelope.isDefault &&
                ` Tag spending with @${envelope.name.toLowerCase().split(' ')[0]} in quick-add and it lands here.`}
            </p>
          ) : (
            <ul aria-label={`${envelope.name} entries`} className="card divide-y divide-line px-4">
              {entries.map((t) => (
                <EntryRow key={t.id} tx={t} onEdit={setEditing} />
              ))}
              {fromBills !== 0 && (
                <li className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 text-muted">Bills linked to {envelope.name}</span>
                  <span className="shrink-0 font-medium tabular-nums">{f.money(-fromBills)}</span>
                </li>
              )}
            </ul>
          )}
          <Button block onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} />
            Add spend to {envelope.name}
          </Button>
          <Link to={logLink} className={buttonClass('secondary', 'md', true)}>
            <Icon name="list" size={18} />
            See all in log
          </Link>
        </div>
      )}
      <TransactionSheet tx={editing} onClose={() => setEditing(null)} />
      <AddEntrySheet
        date={adding ? (today < period.end && today >= period.start ? today : period.start) : null}
        envelopeId={envelope?.id}
        onClose={() => setAdding(false)}
        onAddBill={() => setAdding(false)}
      />
    </Sheet>
  )
}
