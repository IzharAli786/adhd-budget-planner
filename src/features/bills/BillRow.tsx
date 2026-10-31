import { useUndoToast } from '../../app/useUndoToast'
import { markDue, markPaid } from '../../db/repos'
import type { BillEntry } from '../../domain/bills'
import { dayOfWeek } from '../../domain/dates'
import type { ISODate } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { useFormat } from './format'

interface BillRowProps {
  entry: BillEntry
  today: ISODate
  onOpen: (entry: BillEntry) => void
  /** Show the date block on the left (lists); a day sheet already says the date. */
  showDate?: boolean
}

/**
 * One occurrence in a list. The round check is a one-tap "paid" (the most common action,
 * with Undo); the rest of the row opens the full sheet.
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
      undoToast(`${entry.name} marked paid`)
    }
  }

  const meta = [
    paid ? 'Paid' : skipped ? 'Skipped' : overdue ? `Due ${f.relative(entry.date, today)}` : null,
    showDate && !paid && !skipped && !overdue ? f.relative(entry.date, today) : null,
    entry.moved ? `moved from ${f.day(entry.originalDate)}` : null,
    entry.autopay && !paid ? 'autopay' : null,
  ].filter(Boolean)

  return (
    <li className="flex items-center gap-1 pr-2 pl-2">
      {!skipped && (
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={paid ? `Mark ${entry.name} as not paid` : `Mark ${entry.name} paid`}
          aria-pressed={paid}
          className="group inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full"
        >
          <span
            className={cx(
              'flex h-7 w-7 items-center justify-center rounded-full ring-[1.5px] transition-colors',
              paid
                ? 'bg-accent text-accent-contrast ring-accent'
                : 'text-transparent ring-line group-hover:text-muted group-hover:ring-muted',
            )}
          >
            <Icon name="check" size={16} strokeWidth={2.25} />
          </span>
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
              overdue ? 'bg-danger-soft' : 'bg-bg',
            )}
          >
            <span className="text-[0.6875rem] font-medium tracking-wide text-muted uppercase">
              {f.weekday(dayOfWeek(entry.date))}
            </span>
            <span className="font-semibold tabular-nums">{Number(entry.date.slice(8))}</span>
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate font-medium', (paid || skipped) && 'text-muted')}>
            {entry.name}
          </span>
          {meta.length > 0 && (
            <span className={cx('block truncate text-sm', overdue ? 'text-accent' : 'text-muted')}>
              {capitalize(meta.join(' · '))}
            </span>
          )}
        </span>
        <span
          className={cx(
            'shrink-0 font-medium tabular-nums',
            (paid || skipped) && 'text-muted',
            skipped && 'line-through',
          )}
        >
          {f.money(entry.amount)}
        </span>
      </button>
    </li>
  )
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
