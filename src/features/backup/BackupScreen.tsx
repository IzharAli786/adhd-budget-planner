import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  archiveFileName,
  importBackup,
  prepareBackupFile,
  readBackupFile,
  type RestoreError,
  type ValidBackup,
} from '../../db/backup'
import { prepareCsvFile } from '../../db/csv'
import { eraseEverything } from '../../db/erase'
import { getChangesSinceBackup, getMeta } from '../../db/repos'
import type { DataTableName } from '../../db/schema'
import type { Instant } from '../../domain/types'
import { dateTimeFormat } from '../../domain/intl'
import { IS_DEMO } from '../../lib/demo'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { IconTile } from '../../ui/IconTile'
import { Notice } from '../../ui/Notice'
import { PageHeader } from '../../ui/PageHeader'
import { useToast } from '../../ui/Toast'
import { relativeDays } from './relative'
import { SaveBackupButton, SaveFileButton, useBackupFile } from './SaveBackup'

const TABLE_LABELS: Partial<Record<DataTableName, string>> = {
  incomes: 'Income sources',
  bills: 'Bills',
  transactions: 'Transactions',
  checkIns: 'Balance check-ins',
  envelopes: 'Envelopes',
  funds: 'Savings funds',
  debts: 'Debts',
  impulse: '48-hour list',
  noSpend: 'No-spend days',
  notes: 'Notes',
}

// Midday local time, so no time zone can move the calendar day either way.
const formatDay = (iso: string, locale: string) =>
  dateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(`${iso.slice(0, 10)}T12:00:00`))

export function BackupScreen() {
  const { locale } = useAppSettings().settings
  const toast = useToast()
  const lastBackupAt = useLiveQuery(() => getMeta<Instant>('lastBackupAt'))
  const changes = useLiveQuery(getChangesSinceBackup)
  // Prepared as the screen opens, so Save runs inside the tap (see SaveBackup).
  const file = useBackupFile()
  const year = useToday().slice(0, 4)
  const archive = useLiveQuery(() => prepareBackupFile(new Date(), archiveFileName(year)), [year])
  // Same reason: ready before the tap. Rebuilt when the data changes.
  const transactionsCsv = useLiveQuery(() => prepareCsvFile('transactions'))
  const billsCsv = useLiveQuery(() => prepareCsvFile('bills'))
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<ValidBackup | null>(null)
  const [error, setError] = useState<RestoreError | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onPick(picked: File | undefined) {
    if (!picked) return
    const result = await readBackupFile(picked)
    if (inputRef.current) inputRef.current.value = '' // allow picking the same file again
    if (result.ok) setPending(result.backup)
    else setError(result.error)
  }

  async function restore() {
    if (!pending) return
    setBusy(true)
    try {
      await importBackup(pending)
      setPending(null)
      toast.show({
        message: 'Restored. A safety copy of your previous data was kept.',
        duration: 8000,
      })
    } catch {
      setPending(null)
      setError({ code: 'invalid-shape', message: 'Restoring failed. Nothing was changed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Backup & restore"
        subtitle="Your data lives only on this device. A backup file is your safety net."
        back={{ to: '/more', label: 'More' }}
      />

      <div className="space-y-5">
        <section className="card p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <IconTile icon="download" size="md" />
            <div className="min-w-0 flex-1">
              <h2 className="text-heading">Save a backup</h2>
              <p className="text-body text-muted">
                {lastBackupAt
                  ? `Last saved ${relativeDays(lastBackupAt)}${changesNote(changes)}.`
                  : 'You haven’t saved one yet.'}{' '}
                Save it to Files, iCloud Drive, Google Drive or email it to yourself.
              </p>
            </div>
          </div>
          <SaveBackupButton
            file={file}
            className="mt-5"
            onSaved={(result) =>
              toast.show({
                message:
                  result === 'shared'
                    ? 'Backup saved.'
                    : 'Backup downloaded. Keep it somewhere safe.',
              })
            }
          />
          {file && (
            <p className="mt-2 text-center text-sm text-muted">
              {file.name} · {Math.max(1, Math.round(file.size / 1024))} KB
            </p>
          )}
          {/* A year-end keepsake: the same restorable file, named so it's easy to find later. */}
          <div className="mt-5 border-t border-line pt-5">
            <p className="text-body text-muted">
              Closing the year, or about to start fresh? Keep everything up to today in one file
              named for {year}.
            </p>
            <SaveBackupButton
              file={archive}
              label="Save this year as a file"
              variant="secondary"
              size="md"
              className="mt-3"
              onSaved={() => toast.show({ message: `Saved ${archiveFileName(year)}.` })}
            />
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <IconTile icon="list" size="md" />
            <div className="min-w-0 flex-1">
              <h2 className="text-heading">Export for spreadsheets (CSV)</h2>
              <p className="text-body text-muted">
                Open your entries or bills in Excel, Numbers or Google Sheets. It’s a copy to look
                at, not a backup: only the backup file above can be restored.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <SaveFileButton
              file={transactionsCsv}
              label="Transactions (CSV)"
              variant="secondary"
              size="md"
              onSaved={() => toast.show({ message: 'Transactions exported.' })}
            />
            <SaveFileButton
              file={billsCsv}
              label="Bills (CSV)"
              variant="secondary"
              size="md"
              onSaved={() => toast.show({ message: 'Bills exported.' })}
            />
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <IconTile icon="upload" size="md" />
            <div className="min-w-0 flex-1">
              <h2 className="text-heading">Restore from a file</h2>
              <p className="text-body text-muted">
                Replaces what’s on this device. You’ll see what’s inside before anything changes.
              </p>
            </div>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            // hidden, not sr-only: an sr-only input is an unlabelled extra tab stop. The
            // button below opens it, and click() works on hidden file inputs everywhere.
            hidden
            aria-label="Backup file"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <Button
            variant="secondary"
            block
            size="lg"
            className="mt-5"
            onClick={() => inputRef.current?.click()}
          >
            Choose a backup file
          </Button>
        </section>

        <EraseSection backupFile={file} />
      </div>

      <Dialog
        open={pending !== null}
        onClose={() => !busy && setPending(null)}
        title="Restore this backup?"
        description={
          pending &&
          `Saved ${formatDay(pending.preview.exportedAt, locale)} · ${pending.preview.currency}`
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void restore()} disabled={busy}>
              {busy ? 'Restoring…' : 'Replace my data'}
            </Button>
          </>
        }
      >
        {pending && <BackupPreview backup={pending} />}
      </Dialog>

      <Dialog
        open={error !== null}
        onClose={() => setError(null)}
        title="This file can’t be restored"
        description={error?.message}
        actions={<Button onClick={() => setError(null)}>OK</Button>}
      >
        {error?.path && (
          <p className="text-sm text-muted">
            Details for support: <span className="font-mono">{error.code}</span> at{' '}
            <span className="font-mono break-all">{error.path}</span>
          </p>
        )}
      </Dialog>
    </>
  )
}

/**
 * Erase everything on this device: for a shared or sold device, or a true fresh start.
 * The dialog names every consequence and offers the backup first, right where it's needed.
 */
function EraseSection({ backupFile }: { backupFile: File | undefined }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  async function erase() {
    setBusy(true)
    setFailed(false)
    try {
      await eraseEverything()
      setOpen(false)
      navigate('/', { replace: true })
      toast.show({ message: 'Everything was erased from this device.', duration: 8000 })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="erase-title" className="card-quiet p-5 sm:p-6">
      <h2 id="erase-title" className="text-heading">
        Erase everything on this device
      </h2>
      <p className="mt-1 text-body text-muted">
        Removes all of Steady’s data from this browser. Handy before passing a device on, or to
        start completely fresh.
      </p>
      <Button variant="danger" icon="trash" className="mt-4" onClick={() => setOpen(true)}>
        Erase everything…
      </Button>

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Erase everything on this device?"
        description="This can’t be undone."
        actions={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void erase()} disabled={busy}>
              {busy ? 'Erasing…' : 'Erase everything'}
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1.5 pl-5 text-body">
          <li>Every entry, bill, payday, envelope, fund, debt and note goes.</li>
          <li>Your settings and the safety copies kept after a restore go too.</li>
          <li>
            {IS_DEMO
              ? 'The demo starts again from the beginning.'
              : 'You’ll enter your unlock code again, then set up from the start.'}
          </li>
          <li>Backup files you saved elsewhere aren’t touched, and can be restored later.</li>
        </ul>
        <SaveBackupButton
          file={backupFile}
          label="Save a backup first"
          variant="secondary"
          size="md"
          className="mt-5"
          onSaved={() => toast.show({ message: 'Backup saved. Erasing is still up to you.' })}
        />
        {failed && (
          <Notice tone="attention" role="alert" className="mt-3">
            Erasing didn’t finish, so nothing was removed. Please try again.
          </Notice>
        )}
      </Dialog>
    </section>
  )
}

const changesNote = (n: number | undefined) =>
  !n ? '' : n === 1 ? ' · 1 change since' : ` · ${n} changes since`

/** What a backup holds, shown before anything is replaced. Reused by setup's import. */
export function BackupPreview({ backup }: { backup: ValidBackup }) {
  const { locale } = useAppSettings().settings
  const { preview } = backup
  const rows = Object.entries(TABLE_LABELS)
    .map(([table, label]) => ({ label, count: preview.counts[table as DataTableName] }))
    .filter((r) => r.count > 0)

  return (
    <div className="space-y-4">
      {preview.source === 'demo' && (
        <Notice tone="info">
          This file comes from the demo. Only your setup (income, bills, envelopes, savings, debts)
          will come across.
        </Notice>
      )}
      {rows.length > 0 ? (
        <dl className="divide-y divide-line rounded-2xl ring-1 ring-line">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between px-4 py-2.5">
              <dt className="text-muted">{r.label}</dt>
              <dd className="font-medium tabular-nums">{r.count}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-muted">This backup is empty.</p>
      )}
      {preview.from && preview.to && (
        <p className="text-sm text-muted">
          Activity from {formatDay(preview.from, locale)} to {formatDay(preview.to, locale)}.
        </p>
      )}
      <p className="text-sm text-muted">
        Everything currently on this device will be replaced. A safety copy is kept first.
      </p>
    </div>
  )
}
