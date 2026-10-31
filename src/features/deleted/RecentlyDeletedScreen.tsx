import { useState } from 'react'
import { Link } from 'react-router'
import { useUndoToast } from '../../app/useUndoToast'
import { useRecentlyDeleted } from '../../db/hooks'
import {
  purgeAt,
  purgeDeleted,
  restoreDeleted,
  RETENTION_DAYS,
  type DeletedItem,
  type SoftDeleteTable,
} from '../../db/repos'
import { Button, buttonClass } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Icon, type IconName } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { useToast } from '../../ui/Toast'

const KIND: Record<SoftDeleteTable, { noun: string; icon: IconName }> = {
  bills: { noun: 'Bill', icon: 'bills' },
  transactions: { noun: 'Entry', icon: 'list' },
  envelopes: { noun: 'Envelope', icon: 'plan' },
  funds: { noun: 'Savings', icon: 'goals' },
  debts: { noun: 'Debt', icon: 'payday' },
}

/** Whole days until a deleted row goes for good; at least 1 while it is still here. */
function daysLeft(deletedAt: string, now = Date.now()) {
  return Math.max(1, Math.ceil((Date.parse(purgeAt(deletedAt)) - now) / 86_400_000))
}

/** More > Recently deleted (PLAN §8): 30 days to change your mind. */
export function RecentlyDeletedScreen() {
  const items = useRecentlyDeleted()
  const undoToast = useUndoToast()
  const toast = useToast()
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  async function restore(item: DeletedItem) {
    await restoreDeleted(item)
    undoToast(`Restored ${item.name || KIND[item.table].noun.toLowerCase()}`)
  }

  async function empty() {
    // Count what the list showed: a debt's minimum bill goes with it but is not its own row.
    const n = items?.length ?? 0
    await purgeDeleted(new Date(), 0)
    setConfirmEmpty(false)
    toast.show({ message: n === 1 ? '1 item deleted for good.' : `${n} items deleted for good.` })
  }

  return (
    <>
      <PageHeader
        title="Recently deleted"
        subtitle={`Things you delete stay here for ${RETENTION_DAYS} days, then go for good.`}
        back={{ to: '/more', label: 'More' }}
      />

      {items === undefined ? null : items.length === 0 ? (
        <EmptyState
          art="tray"
          title="Nothing deleted"
          action={
            <Link to="/more" className={buttonClass('secondary')}>
              Back to More
            </Link>
          }
        >
          If you delete a bill or an entry, it waits here in case you want it back.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <ul className="card divide-y divide-line overflow-hidden">
            {items.map((item) => {
              const kind = KIND[item.table]
              const left = daysLeft(item.deletedAt)
              return (
                <li
                  key={`${item.table}:${item.id}`}
                  className="flex items-center gap-3.5 px-4 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon name={kind.icon} size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.name || kind.noun}</span>
                    <span className="block text-sm text-muted">
                      {kind.noun} · {left === 1 ? '1 day left' : `${left} days left`}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Restore ${item.name || kind.noun}`}
                    onClick={() => void restore(item)}
                  >
                    Restore
                  </Button>
                </li>
              )
            })}
          </ul>
          <div className="text-center">
            <Button variant="ghost" className="text-muted" onClick={() => setConfirmEmpty(true)}>
              Delete all for good
            </Button>
          </div>
        </div>
      )}

      <Dialog
        open={confirmEmpty}
        onClose={() => setConfirmEmpty(false)}
        title="Delete these for good?"
        description="They can’t be brought back after this, not even with Undo."
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmEmpty(false)}>
              Keep them
            </Button>
            <Button variant="danger" onClick={() => void empty()}>
              Delete for good
            </Button>
          </>
        }
      />
    </>
  )
}
