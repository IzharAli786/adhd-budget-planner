import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { prepareBackupFile } from '../../db/backup'
import { recordBackup } from '../../db/repos'
import { canShareFile, shareOrDownload, type SaveResult } from '../../lib/share'
import { Button, buttonClass, type ButtonVariant } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'

const REVOKE_DELAY_MS = 10_000

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

/** Save backup: a SaveFileButton that also records the backup (resets the nudge). */
export function SaveBackupButton({ onSaved, label = 'Save backup', ...rest }: Props) {
  return (
    <SaveFileButton
      {...rest}
      label={label}
      onSaved={async (result) => {
        await recordBackup()
        onSaved?.(result)
      }}
    />
  )
}

interface SaveFileProps extends Props {
  label: string
  variant?: ButtonVariant
  size?: 'md' | 'lg'
}

/**
 * One tap to save a ready file. Where the share sheet takes files it is a button that calls
 * navigator.share() synchronously in the click; elsewhere it is a plain download link,
 * which needs no script at all at tap time.
 */
export function SaveFileButton({
  file,
  onSaved,
  label,
  className,
  variant = 'primary',
  size = 'lg',
}: SaveFileProps) {
  const share = file !== undefined && canShareFile(file)
  const href = useMemo(
    () => (file && !share ? URL.createObjectURL(file) : undefined),
    [file, share],
  )
  // Not revoked at once: tapping the link saves a backup, the data change re-prepares the
  // file, and revoking the old URL milliseconds after the tap can cancel the download in
  // Safari (same reason as download() in lib/share).
  useEffect(
    () => () => {
      if (href) setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS)
    },
    [href],
  )

  const saved = (result: Exclude<SaveResult, 'cancelled'>) => void onSaved?.(result)

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
        onClick={() => saved('downloaded')}
        className={cx(buttonClass(variant, size, true), className)}
      >
        {content}
      </a>
    )
  }
  return (
    <Button
      block
      size={size}
      variant={variant}
      className={className}
      disabled={!file}
      onClick={() => {
        if (!file) return
        // No await before this call: it must run inside the tap (PLAN §6).
        void shareOrDownload(file).then((result) => {
          if (result !== 'cancelled') saved(result)
        })
      }}
    >
      {content}
    </Button>
  )
}
