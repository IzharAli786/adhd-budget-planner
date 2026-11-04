import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useUndoToast } from '../../app/useUndoToast'
import { deleteTransaction } from '../../db/repos'
import type { Transaction } from '../../domain/types'
import { Button, buttonClass } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { StatusBadge, type StatusSpec } from '../../ui/status'

/**
 * One row on an Envelopes card: the name, the amount in the display face, then the row's
 * actions in a fixed-width slot so every amount lines up. The line below holds the badges
 * (where the row comes from, its state) and the date, and runs under the amount too, so a
 * narrow phone keeps every row to two lines instead of stacking badges under a short name.
 */
export function EntryLine({
  name,
  sub,
  tag,
  status,
  amount,
  incoming = false,
  actions,
}: {
  name: string
  sub: ReactNode
  /** Where the row comes from (TAG.bill, TAG.payday): a word and a glyph, never colour alone. */
  tag?: StatusSpec
  /** Its state, when it has one worth saying (BILL_STATUS.paid). */
  status?: StatusSpec
  amount: string
  /** Money in (income, a refund): the amount is in the success tone. */
  incoming?: boolean
  actions: ReactNode
}) {
  return (
    // DOM order is name, details, amount, actions (what a screen reader reads, and what the
    // row's text was before); the grid puts the amount and actions up on the name's line.
    <li className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto_6.375rem] items-start gap-x-2 border-t border-line py-3 first:border-t-0 sm:gap-x-3">
      <p className="col-start-1 row-start-1 leading-6 font-semibold break-words">{name}</p>
      <p className="col-span-2 col-start-1 row-start-2 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted">
        {tag && <StatusBadge status={tag} />}
        {status && <StatusBadge status={status} />}
        <span>{sub}</span>
      </p>
      <span
        className={cx(
          'col-start-2 row-start-1 amount text-lg leading-6 whitespace-nowrap sm:text-[1.1875rem]',
          incoming && 'text-tone-success',
        )}
      >
        {amount}
      </span>
      {/* 7.125rem in all, wide enough for "Calendar" with its glyph, or Edit and ×: the
          column is 6.375rem and -mr-3 runs the slot into the card's padding, so the last
          label or glyph lines up with the card's text edge. */}
      <div className="col-start-3 row-start-1 -my-2.5 -mr-3 flex items-center justify-end">
        {actions}
      </div>
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
      <Button variant="quiet" onClick={() => onEdit(tx)} aria-label={`Edit ${label}`}>
        Edit
      </Button>
      <IconButton
        icon="close"
        tone="danger"
        size="sm"
        label={`Delete ${label}`}
        onClick={async () => {
          await deleteTransaction(tx.id)
          undoToast(`Deleted ${label}`)
        }}
      />
    </>
  )
}

/** For rows that live on the calendar (bills, paydays): changed there, not here. */
export function CalendarLink({ label, to = '/bills' }: { label: string; to?: string }) {
  return (
    <Link to={to} aria-label={`Open ${label} in Calendar`} className={buttonClass('quiet', 'md')}>
      <Icon name="calendar" size={18} className="shrink-0" />
      Calendar
    </Link>
  )
}
