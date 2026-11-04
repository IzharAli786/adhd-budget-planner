import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { DEMO_CAP, DEMO_DAYS, entriesLeft, getDemoState, resetDemo } from '../../db/demo'
import { addDays } from '../../domain/dates'
import { todayISO } from '../../lib/clock'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { ListGroup, ListRow } from '../../ui/List'
import { PageHeader } from '../../ui/PageHeader'
import { SaveBackupButton, useBackupFile } from '../backup/SaveBackup'
import { useFormat } from '../bills/format'

/** The demo's own rows at the top of More: take the setup along, or start over. */
export function DemoMoreGroup() {
  const f = useFormat()
  const navigate = useNavigate()
  const state = useLiveQuery(getDemoState)
  const [confirm, setConfirm] = useState(false)
  const left = entriesLeft(state)
  const resetsOn = state ? addDays(todayISO(new Date(state.startedAt)), DEMO_DAYS) : null

  return (
    <>
      <ListGroup title="Demo">
        <ListRow
          icon="upload"
          label="Bring your setup into the full app"
          detail="Your pay, bills, savings and debts, in one file"
          to="/more/bring"
        />
        <ListRow
          icon="refresh"
          label="Reset demo"
          detail={`${left} of ${DEMO_CAP} entries left${resetsOn ? ` · starts fresh ${f.day(resetsOn)}` : ''}`}
          onClick={() => setConfirm(true)}
        />
      </ListGroup>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Start the demo over?"
        description="Everything in this demo is cleared, and you can pick sample data or your own numbers again."
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon="trash"
              onClick={async () => {
                await resetDemo()
                setConfirm(false)
                navigate('/', { replace: true })
              }}
            >
              Reset demo
            </Button>
          </>
        }
      />
    </>
  )
}

/**
 * "Bring your setup into the full app" (PLAN §7). In the demo build the backup file is
 * marked source:'demo', and the full app's restore only takes the setup from it.
 */
export function BringSetupScreen() {
  const file = useBackupFile()
  const [saved, setSaved] = useState(false)
  return (
    <>
      <PageHeader
        title="Bring your setup across"
        subtitle="Start the full app with what you set up here."
        back={{ to: '/more', label: 'More' }}
      />
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="font-semibold">Comes across</h2>
              <p className="mt-1 text-[0.9375rem] text-muted">
                Your pay and paydays, bills, envelopes, savings funds and debts.
              </p>
            </div>
            <div>
              <h2 className="font-semibold">Stays in the demo</h2>
              <p className="mt-1 text-[0.9375rem] text-muted">
                Spending, balance check-ins, no-spend days and the 48-hour list. The full app starts
                with a fresh balance.
              </p>
            </div>
          </div>
          <SaveBackupButton file={file} label="Save my setup" onSaved={() => setSaved(true)} />
          <p aria-live="polite" className="min-h-5 text-center text-sm text-muted">
            {saved && 'Saved. Keep the file somewhere you can find it, like Files or Downloads.'}
          </p>
        </section>

        <section className="space-y-2 px-1">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            Then, in the full app
          </h2>
          <ol className="list-decimal space-y-1.5 pl-5 text-[0.9375rem]">
            <li>Open it and enter your code.</li>
            <li>When it asks about your payday, tap “Start from a backup or demo file”.</li>
            <li>Add your current balance. That’s it.</li>
          </ol>
        </section>
      </div>
    </>
  )
}
