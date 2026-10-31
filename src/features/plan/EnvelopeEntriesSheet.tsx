import { Link } from 'react-router'
import { useTransactions } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import type { DateRange } from '../../domain/insights'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import type { Envelope, ISODate, Transaction } from '../../domain/types'
import { buttonClass } from '../../ui/Button'
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
  today: ISODate,
): Transaction[] {
  const known = new Set(envelopes.map((e) => e.id))
  const fallback = envelopes.find((e) => e.isDefault)?.id
  const home = (id: string | undefined) => (id !== undefined && known.has(id) ? id : fallback)
  return transactions
    .filter(
      (t) =>
        t.deletedAt === undefined &&
        t.fundId === undefined &&
        t.billOccurrenceId === undefined &&
        t.date >= period.start &&
        t.date <= today &&
        (t.amount < 0 || (t.envelopeId !== undefined && known.has(t.envelopeId))) &&
        home(t.envelopeId) === envelope.id,
    )
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
  const transactions = useTransactions(period.start, today)
  const entries =
    envelope && transactions
      ? envelopeEntries(envelope, envelopes, transactions, period, today)
      : []
  const total = -entries.reduce((sum, t) => sum + t.amount, 0)
  // usage.spent also counts paid bills linked to this envelope.
  const fromBills = usage ? usage.spent - total : 0
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
      description={`This pay period · ${range}`}
    >
      {envelope && (
        <div className="space-y-4 pb-4">
          <div className="flex items-center gap-3 rounded-2xl bg-bg px-4 py-3">
            <EnvelopeDot color={envelope.color} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-muted">Spent this period</p>
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
            <ul aria-label={`${envelope.name} entries`} className="card divide-y divide-line">
              {entries.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {t.note || (t.amount < 0 ? 'Spent' : 'Money back')}
                    </span>
                    <span className="text-sm text-muted">{f.day(t.date)}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {t.amount > 0 ? '+' : ''}
                    {f.money(t.amount)}
                  </span>
                </li>
              ))}
              {fromBills !== 0 && (
                <li className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 text-muted">Bills linked to {envelope.name}</span>
                  <span className="shrink-0 font-medium tabular-nums">{f.money(-fromBills)}</span>
                </li>
              )}
            </ul>
          )}
          <Link to={logLink} className={buttonClass('secondary', 'md', true)}>
            <Icon name="list" size={18} />
            See all in log
          </Link>
        </div>
      )}
    </Sheet>
  )
}
