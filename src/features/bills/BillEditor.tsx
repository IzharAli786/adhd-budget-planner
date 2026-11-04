import { useId, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { useEnvelopes } from '../../db/hooks'
import { addBill, deleteBill } from '../../db/repos'
import type { Bill, ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Sheet } from '../../ui/Sheet'
import { applyBillEdit, hasChanges, onlyAmountChanged, type BillChanges } from './actions'
import { BillForm } from './BillForm'
import { EditScopeDialog } from './EditScopeDialog'
import { useFormat } from './format'

export interface BillEditorTarget {
  bill?: Bill
  /** Set when editing started from one occurrence: enables "Just this one / following". */
  originalDate?: ISODate
  defaultDate?: ISODate
}

interface BillEditorProps {
  target: BillEditorTarget | null
  today: ISODate
  onClose: () => void
}

export function BillEditor({ target, today, onClose }: BillEditorProps) {
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={target?.bill ? `Edit ${target.bill.name}` : 'Add a bill'}
      description={target?.bill ? undefined : 'Anything that leaves your account on a date.'}
    >
      {/* Keyed so each open starts from the bill's current values, not the last draft. */}
      {target && (
        <EditorBody
          key={target.bill?.id ?? 'new'}
          target={target}
          today={today}
          onClose={onClose}
        />
      )}
    </Sheet>
  )
}

function EditorBody({
  target,
  today,
  onClose,
}: {
  target: BillEditorTarget
  today: ISODate
  onClose: () => void
}) {
  const formId = useId()
  const f = useFormat()
  const undoToast = useUndoToast()
  const { bill, originalDate } = target
  const [pending, setPending] = useState<BillChanges | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const repeating = bill !== undefined && bill.rule.freq !== 'once'
  const { settings } = useAppSettings()
  const allEnvelopes = useEnvelopes()
  // Linking a bill to an envelope is a Full-mode tool, and only while envelopes are on.
  const envelopes =
    settings.envelopesEnabled && !settings.simpleMode
      ? (allEnvelopes ?? []).filter((e) => e.deletedAt === undefined)
      : []

  async function save(changes: BillChanges) {
    if (!bill) {
      await addBill({
        name: changes.name,
        amount: changes.amount,
        autopay: changes.autopay,
        rule: changes.rule!,
        ...(changes.envelopeId ? { envelopeId: changes.envelopeId } : {}),
      })
      undoToast(`Added ${changes.name}`)
      onClose()
      return
    }
    if (!hasChanges(bill, changes)) return onClose()
    // A repeating bill opened from one date asks which dates the edit covers.
    if (repeating && originalDate) return setPending(changes)
    undoToast(await applyBillEdit(bill, changes, 'all', today))
    onClose()
  }

  async function remove() {
    if (!bill) return
    await deleteBill(bill.id)
    undoToast(`Deleted ${bill.name}`)
    onClose()
  }

  return (
    <>
      <BillForm
        id={formId}
        bill={bill}
        defaultDate={target.defaultDate ?? today}
        today={today}
        onSubmit={(c) => void save(c)}
        envelopes={envelopes}
      />
      {/* -bottom-2 covers the scroll area's pb-2; at bottom-0 fields peeked out under Delete. */}
      <div className="sticky -bottom-2 -mx-6 mt-2 flex flex-col-reverse gap-2 border-t border-line bg-surface px-6 pt-3 pb-6 sm:flex-row sm:items-center">
        {bill && (
          <Button
            variant="quiet"
            icon="trash"
            className="sm:mr-auto"
            // One-off bills go at once with Undo; a whole series asks first (PLAN §8).
            onClick={() => (repeating ? setConfirmDelete(true) : void remove())}
          >
            Delete
          </Button>
        )}
        <Button type="submit" form={formId} className="sm:ml-auto sm:min-w-32">
          {bill ? 'Save' : 'Add bill'}
        </Button>
      </div>

      {bill && pending && (
        <EditScopeDialog
          open
          billName={bill.name}
          dateLabel={f.day(originalDate ?? today)}
          canChangeOne={onlyAmountChanged(bill, pending)}
          onClose={() => setPending(null)}
          onChoose={async (scope) => {
            undoToast(await applyBillEdit(bill, pending, scope, today, originalDate))
            setPending(null)
            onClose()
          }}
        />
      )}

      {bill && (
        <Dialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          title={`Delete ${bill.name}?`}
          description={`Every ${bill.name} bill leaves your calendar. Ones you already paid stay in your history, and you can bring it back from Recently deleted for 30 days.`}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button variant="danger" icon="trash" onClick={() => void remove()}>
                Delete {bill.name}
              </Button>
            </>
          }
        />
      )}
    </>
  )
}
