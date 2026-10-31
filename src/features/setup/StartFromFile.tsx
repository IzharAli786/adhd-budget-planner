import { useRef, useState } from 'react'
import { importBackup, readBackupFile, type RestoreError, type ValidBackup } from '../../db/backup'
import { saveSetupProgress } from '../../db/repos'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { BackupPreview } from '../backup/BackupScreen'

/**
 * "Start from a backup or demo file" (PLAN §5): the M2 restore, offered as a way to
 * skip the questions. A file that brings an income finishes setup; a demo file without
 * one drops the person back into the questions with nothing lost.
 */
export function StartFromFile({ ackAt }: { ackAt: string | undefined }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ValidBackup | null>(null)
  const [error, setError] = useState<RestoreError | null>(null)
  const [busy, setBusy] = useState(false)

  async function onPick(file: File | undefined) {
    if (!file) return
    const result = await readBackupFile(file)
    if (inputRef.current) inputRef.current.value = ''
    if (result.ok) setPending(result.backup)
    else setError(result.error)
  }

  async function confirm() {
    if (!pending) return
    setBusy(true)
    try {
      await importBackup(pending)
      const hasIncome = pending.file.data.incomes.length > 0
      // The file replaced meta, including any progress it carried. Keep this device's
      // acknowledgement: it was given here, and it is asked only once.
      await saveSetupProgress({
        step: hasIncome ? 'done' : 'payday',
        ackAt: ackAt ?? new Date().toISOString(),
        ...(hasIncome ? { doneAt: new Date().toISOString() } : {}),
      })
      setPending(null)
    } catch {
      setPending(null)
      setError({ code: 'invalid-shape', message: 'Using that file failed. Nothing was changed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        hidden
        aria-label="Backup or demo file"
        onChange={(e) => void onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-body font-medium text-accent hover:bg-accent-soft/60"
      >
        <Icon name="upload" size={18} />
        Start from a backup or demo file
      </button>

      <Dialog
        open={pending !== null}
        onClose={() => !busy && setPending(null)}
        title="Start from this file?"
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={busy}>
              {busy ? 'Loading…' : 'Use this file'}
            </Button>
          </>
        }
      >
        {pending && <BackupPreview backup={pending} />}
      </Dialog>

      <Dialog
        open={error !== null}
        onClose={() => setError(null)}
        title="This file can’t be used"
        description={error?.message}
        actions={<Button onClick={() => setError(null)}>OK</Button>}
      />
    </>
  )
}
