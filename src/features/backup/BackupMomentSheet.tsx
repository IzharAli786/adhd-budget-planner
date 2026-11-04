import type { Cents } from '../../domain/money'
import { Button } from '../../ui/Button'
import { Notice } from '../../ui/Notice'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { useFormat } from '../bills/format'
import { carryLine } from '../review/carry'
import { SaveBackupButton, useBackupFile } from './SaveBackup'

/**
 * The payday backup moment (PLAN §6): right after the payday check-in, one tap saves a
 * backup. The file is prepared the moment this sheet opens, so that tap can go straight
 * to the share sheet.
 */
export function BackupMomentSheet({
  open,
  onClose,
  carried = null,
}: {
  open: boolean
  onClose: () => void
  /** What was carried into this payday, once worked out (Look back keeps it too). */
  carried?: Cents | null
}) {
  const f = useFormat()
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Payday done. Save a backup?"
      description="One tap. Keep the file in Files, iCloud Drive or Google Drive."
    >
      {carried !== null && (
        <Notice tone="info" role="status" className="mb-4">
          {carryLine(carried, f.money)}
        </Notice>
      )}
      {open && <BackupMoment onClose={onClose} />}
    </Sheet>
  )
}

function BackupMoment({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const file = useBackupFile()
  return (
    <div className="space-y-2 pb-4">
      <SaveBackupButton
        file={file}
        onSaved={() => {
          toast.show({ message: 'Backup saved. Nicely done.' })
          onClose()
        }}
      />
      <Button variant="quiet" block onClick={onClose}>
        Not now
      </Button>
    </div>
  )
}
