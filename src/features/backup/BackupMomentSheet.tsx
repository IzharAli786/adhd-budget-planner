import { Button } from '../../ui/Button'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { SaveBackupButton, useBackupFile } from './SaveBackup'

/**
 * The payday backup moment (PLAN §6): right after the payday check-in, one tap saves a
 * backup. The file is prepared the moment this sheet opens, so that tap can go straight
 * to the share sheet.
 */
export function BackupMomentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Payday done. Save a backup?"
      description="One tap. Keep the file in Files, iCloud Drive or Google Drive."
    >
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
      <Button variant="ghost" block onClick={onClose} className="text-muted">
        Not now
      </Button>
    </div>
  )
}
