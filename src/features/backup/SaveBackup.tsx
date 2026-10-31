import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { prepareBackupFile } from '../../db/backup'
import { recordBackup } from '../../db/repos'
import { canShareFile, shareOrDownload, type SaveResult } from '../../lib/share'
import { Button, buttonClass } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'

/**
 * The backup file, built as soon as the screen or sheet using it mounts and rebuilt when
 * the data changes (useLiveQuery re-runs the export), so a tap never waits on IndexedDB.
 * Undefined while the first one is being prepared.
 */
export const useBackupFile = () => useLiveQuery(() => prepareBackupFile())

interface Props {
  file: File | undefined
  /** After the file left the app (shared or downloaded); not called on cancel. */
  onSaved?: (result: Exclude<SaveResult, 'cancelled'>) => void
  label?: string
  className?: string
}

/**
 * One tap to save. Where the share sheet takes files it is a button that calls
 * navigator.share() synchronously in the click; elsewhere it is a plain download link,
 * which needs no script at all at tap time.
 */
export function SaveBackupButton({ file, onSaved, label = 'Save backup', className }: Props) {
  const share = file !== undefined && canShareFile(file)
  const href = useMemo(
    () => (file && !share ? URL.createObjectURL(file) : undefined),
    [file, share],
  )
  useEffect(() => () => void (href && URL.revokeObjectURL(href)), [href])

  async function saved(result: Exclude<SaveResult, 'cancelled'>) {
    await recordBackup()
    onSaved?.(result)
  }

  const content = (
    <>
      <Icon name={share ? 'share' : 'download'} size={20} />
      {file ? label : 'Preparing…'}
    </>
  )

  if (file && href) {
    return (
      <a
        href={href}
        download={file.name}
        onClick={() => void saved('downloaded')}
        className={cx(buttonClass('primary', 'lg', true), className)}
      >
        {content}
      </a>
    )
  }
  return (
    <Button
      block
      size="lg"
      className={className}
      disabled={!file}
      onClick={() => {
        if (!file) return
        // No await before this call: it must run inside the tap (PLAN §6).
        void shareOrDownload(file).then((result) => {
          if (result !== 'cancelled') void saved(result)
        })
      }}
    >
      {content}
    </Button>
  )
}
