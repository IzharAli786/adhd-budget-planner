import { useUndoToast } from '../../app/useUndoToast'
import { deleteTransaction } from '../../db/repos'
import { txKind } from '../../domain/safeToSpend'
import type { Transaction } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { IconButton } from '../../ui/IconButton'
import { useFormat } from '../bills/format'

const KIND_LABEL = {
  income: 'Income',
  expense: 'Expense',
  refund: 'Refund',
  saving: 'Savings',
  debt: 'Debt payment',
  billPayment: 'Bill payment',
} as const

/**
 * One logged entry with Edit and × right on the row (PLAN-v2 item 5). Delete is one tap
 * because Undo is in the toast and the row sits in Recently deleted for 30 days.
 */
export function EntryRow({
  tx,
  onEdit,
  showDate = true,
  showKind = false,
}: {
  tx: Transaction
  onEdit: (tx: Transaction) => void
  showDate?: boolean
  showKind?: boolean
}) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const kind = txKind(tx)
  const label = tx.note || KIND_LABEL[kind]
  const sub = [showKind && KIND_LABEL[kind], showDate && f.day(tx.date)].filter(Boolean).join(' · ')
  // Money in reads "+"; savings and debt moves read as amounts, not as spending.
  const positive = tx.amount > 0
  return (
    <li className="flex min-h-14 items-center gap-2 py-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {sub && <span className="block text-caption text-muted">{sub}</span>}
      </span>
      <span className={cx('shrink-0 font-medium tabular-nums', positive && 'text-tone-success')}>
        {positive ? '+' : ''}
        {f.money(Math.abs(tx.amount))}
      </span>
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
        className="-mr-3"
      />
    </li>
  )
}
