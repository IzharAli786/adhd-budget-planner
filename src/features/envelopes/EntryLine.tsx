import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useUndoToast } from '../../app/useUndoToast'
import { deleteTransaction } from '../../db/repos'
import type { Transaction } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'

/** Quiet text button: "+ Add spend", "Rename", "Delete", "Edit". 44px tall for thumbs. */
export const textButton =
  'inline-flex min-h-11 items-center justify-center rounded-full px-2.5 text-body text-muted transition-colors hover:bg-accent-soft/60 hover:text-text'

/**
 * One row on an Envelopes card: name over its date on the left, the amount in the display
 * face, then the row's actions in a fixed-width slot so every amount lines up.
 */
export function EntryLine({
  name,
  sub,
  tag,
  amount,
  actions,
}: {
  name: string
  sub: ReactNode
  /** A word that says where the row comes from ("Bill", "Payday"), never colour alone. */
  tag?: string
  amount: string
  actions: ReactNode
}) {
  return (
    <li className="flex min-h-16 items-center gap-2 border-t border-line py-3 first:border-t-0 sm:gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{name}</span>
          {tag && (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
              {tag}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-muted">{sub}</p>
      </div>
      <span className="shrink-0 font-display text-[1.0625rem] font-semibold tabular-nums sm:text-lg">
        {amount}
      </span>
      <div className="-mr-2.5 flex w-[5.75rem] shrink-0 items-center justify-end">{actions}</div>
    </li>
  )
}

/** Edit and ×: × deletes at once, because Undo is in the toast and Recently deleted keeps it. */
export function EntryActions({
  tx,
  label,
  onEdit,
}: {
  tx: Transaction
  label: string
  onEdit: (tx: Transaction) => void
}) {
  const undoToast = useUndoToast()
  return (
    <>
      <button
        type="button"
        onClick={() => onEdit(tx)}
        aria-label={`Edit ${label}`}
        className={textButton}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={async () => {
          await deleteTransaction(tx.id)
          undoToast(`Deleted ${label}`)
        }}
        aria-label={`Delete ${label}`}
        className={cx(textButton, 'min-w-11 px-0')}
      >
        <Icon name="close" size={15} />
      </button>
    </>
  )
}

/** For rows that live on the calendar (bills, paydays): changed there, not here. */
export function CalendarLink({ label, to = '/bills' }: { label: string; to?: string }) {
  return (
    <Link to={to} aria-label={`Open ${label} in Calendar`} className={textButton}>
      Calendar
    </Link>
  )
}
