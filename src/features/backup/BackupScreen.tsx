import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { importBackup, readBackupFile, type RestoreError, type ValidBackup } from '../../db/backup'
import { getChangesSinceBackup, getMeta } from '../../db/repos'
import type { DataTableName } from '../../db/schema'
import type { Instant } from '../../domain/types'
import { dateTimeFormat } from '../../domain/intl'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { PageHeader } from '../../ui/PageHeader'
import { useToast } from '../../ui/Toast'
import { relativeDays } from './relative'
import { SaveBackupButton, useBackupFile } from './SaveBackup'

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
        <section className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-line">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Icon name="share" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Save a backup</h2>
              <p className="text-[0.9375rem] text-muted">
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
        </section>

        <section className="rounded-[1.75rem] bg-surface p-6 shadow-card ring-1 ring-line">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Icon name="upload" size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold">Restore from a file</h2>
              <p className="text-[0.9375rem] text-muted">
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
            <Button variant="danger" onClick={() => void restore()} disabled={busy}>
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
        <p className="rounded-2xl bg-accent-soft p-3 text-sm">
          This file comes from the demo. Only your setup (income, bills, envelopes, savings, debts)
          will come across.
        </p>
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
