import { useUndoToast } from '../../app/useUndoToast'
import { markDue, markPaid } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import { dayOfWeek } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { CheckboxMark } from '../../ui/Checkbox'
import { cx } from '../../ui/cx'
import { BILL_STATUS, StatusBadge } from '../../ui/status'
import { useFormat } from './format'

interface BillRowProps {
  entry: BillEntry
  today: ISODate
  onOpen: (entry: BillEntry) => void
  /** Show the date block on the left (lists); a day sheet already says the date. */
  showDate?: boolean
}

/**
 * One occurrence in a list. The tick is a one-tap "paid" (the most common action, with
 * Undo); the rest of the row opens the full sheet. Statuses are badges (word, glyph and
 * tone) ahead of the muted details on the line under the name.
 */
export function BillRow({ entry, today, onOpen, showDate = true }: BillRowProps) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const paid = entry.status === 'paid'
  const skipped = entry.status === 'skipped'
  const overdue = entry.status === 'due' && entry.date < today

  async function toggle() {
    if (paid) {
      await markDue(entry.billId, entry.originalDate)
      undoToast(`${entry.name} marked not paid`)
    } else {
      await markPaid(entry.billId, entry.originalDate, entry.amount)
      undoToast(`${entry.name} marked paid`, { tone: 'success' })
    }
  }

  // The relative date is shown for overdue rows too ("3 days ago"): the badge says Overdue.
  const meta = [
    showDate && !paid && !skipped ? f.relative(entry.date, today) : null,
    entry.moved ? `moved from ${f.day(entry.originalDate)}` : null,
  ].filter(Boolean)
  const status = paid
    ? BILL_STATUS.paid
    : skipped
      ? BILL_STATUS.skipped
      : overdue
        ? BILL_STATUS.overdue
        : null
  const badges = [
    status,
    entry.autopay && !paid ? BILL_STATUS.autopay : null,
    entry.debtId ? BILL_STATUS.debtMinimum : null,
  ].filter((b) => b !== null)

  return (
    <li className="flex items-center gap-1 pr-2 pl-2">
      {!skipped && (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={paid ? `Mark ${entry.name} as not paid` : `Mark ${entry.name} paid`}
          aria-pressed={paid}
          className="grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent-soft/60"
        >
          <CheckboxMark checked={paid} tone="success" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(entry)}
        className={cx(
          'flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl py-2 pr-2 text-left transition-colors hover:bg-accent-soft/40',
          skipped && 'pl-3',
        )}
      >
        {showDate && (
          <span
            className={cx(
              'flex w-11 shrink-0 flex-col items-center rounded-xl py-1 leading-tight',
              overdue ? 'bg-tone-attention-bg text-tone-attention' : 'bg-bg',
            )}
          >
            <span
              className={cx(
                'text-[0.6875rem] font-medium tracking-wide uppercase',
                !overdue && 'text-muted',
              )}
            >
              {f.weekday(dayOfWeek(entry.date))}
            </span>
            <span className="font-semibold tabular-nums">{Number(entry.date.slice(8))}</span>
          </span>
        )}
        {/* Name and amount share the first line; with large text (or a long name) the
            amount drops under the name instead of squeezing it to "Ele…". The badges and
            details get a full-width line of their own (order-last), under the amount too,
            so "Paid" and "Debt minimum" sit side by side on a phone instead of stacking.
            The DOM keeps name, details, amount: the order the button's name is read in. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3">
          <span
            className={cx(
              'min-w-[min(100%,7rem)] flex-1 font-medium break-words',
              (paid || skipped) && 'text-muted',
            )}
          >
            {entry.name}
          </span>
          {(badges.length > 0 || meta.length > 0) && (
            <span className="order-last mt-0.5 flex basis-full flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
              {badges.map((b) => (
                <StatusBadge key={b.label} status={b} />
              ))}
              {meta.length > 0 && <span>{capitalize(meta.join(' · '))}</span>}
            </span>
          )}
          <span
            className={cx(
              'ml-auto shrink-0 font-medium tabular-nums',
              (paid || skipped) && 'text-muted',
              skipped && 'line-through',
            )}
          >
            {f.money(entry.amount)}
          </span>
        </span>
      </button>
    </li>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
