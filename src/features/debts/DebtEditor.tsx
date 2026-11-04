import { useId, useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { addDebt, deleteDebt, updateDebt } from '../../db/repos'
import type { Debt, ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Sheet } from '../../ui/Sheet'
import { DebtForm, type DebtValues } from './DebtForm'

/** `null` closed, `{}` adding, `{ debt }` editing. */
export type DebtEditorTarget = { debt?: Debt } | null

export function DebtEditor({
  target,
  today,
  onClose,
}: {
  target: DebtEditorTarget
  today: ISODate
  onClose: () => void
}) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={target?.debt ? `Edit ${target.debt.name}` : 'Add a debt'}
      description={
        target?.debt
          ? undefined
          : 'A card, loan or anything you’re paying down. Copy it from a statement.'
      }
    >
      {target && (
        <EditorBody
          key={target.debt?.id ?? 'new'}
          debt={target.debt}
          today={today}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function EditorBody({
  debt,
  today,
  onClose,
}: {
  debt?: Debt
  today: ISODate
  onClose: () => void
}) {
  const formId = useId()
  const undoToast = useUndoToast()
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function save(v: DebtValues) {
    if (debt) {
      await updateDebt(debt.id, v, today)
      undoToast(`Saved ${v.name}`)
    } else {
      await addDebt({ ...v, balanceAsOf: today })
      undoToast(`Added ${v.name}. Its minimum is in Bills now.`)
    }
    onClose()
  }

  async function remove() {
    if (!debt) return
    await deleteDebt(debt.id)
    undoToast(`Deleted ${debt.name}`)
    onClose()
  }

  return (
    <>
      <DebtForm id={formId} debt={debt} onSubmit={(v) => void save(v)} />
      <div className="sticky -bottom-2 -mx-6 mt-2 flex flex-col-reverse gap-2 border-t border-line bg-surface px-6 pt-3 pb-6 sm:flex-row sm:items-center">
        {debt && (
          <Button
            variant="quiet"
            icon="trash"
            className="sm:mr-auto"
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </Button>
        )}
        <Button type="submit" form={formId} className="sm:ml-auto sm:min-w-32">
          {debt ? 'Save' : 'Add debt'}
        </Button>
      </div>

      {debt && (
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete ${debt.name}?`}
          description={`Its minimum payment leaves Bills too. Payments already marked paid stay in your history, and you can bring it back from Recently deleted for 30 days.`}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button variant="danger" icon="trash" onClick={() => void remove()}>
                Delete {debt.name}
              </Button>
            </>
          }
        />
      )}
    </>
  )
}
