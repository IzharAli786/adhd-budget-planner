import { useUndoToast } from '../../app/useUndoToast'
import { deleteTransaction } from '../../db/repos'
import { txKind } from '../../domain/safeToSpend'
import type { Transaction } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
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
      <span className={cx('shrink-0 font-semibold tabular-nums', positive && 'text-accent')}>
        {positive ? '+' : ''}
        {f.money(Math.abs(tx.amount))}
      </span>
      <button
        type="button"
        onClick={() => onEdit(tx)}
        aria-label={`Edit ${label}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm text-muted hover:bg-accent-soft/60"
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
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60"
      >
        <Icon name="close" size={16} />
      </button>
    </li>
  )
}
