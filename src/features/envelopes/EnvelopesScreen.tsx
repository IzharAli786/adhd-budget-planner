import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { deleteEnvelope, ensureDefaultEnvelope } from '../../db/repos'
import { monthSpan } from '../../domain/safeToSpend'
import { moneyFor } from '../../domain/today'
import type { Envelope, Id, ISODate, Transaction } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { PageHeader } from '../../ui/PageHeader'
import { Switch } from '../../ui/Switch'
import { AddEntrySheet } from '../bills/AddEntrySheet'
import { useFormat } from '../bills/format'
import { useTodayModel } from '../today/useTodayModel'
import { TransactionSheet } from '../transactions/TransactionsScreen'
import { EnvelopeCard } from './EnvelopeCard'
import { EnvelopeSheet, RenameSheet } from './EnvelopeSheet'
import { envelopeEntries, linkedBillEntries } from './entries'
import { IncomeCard } from './IncomeCard'
import { MonthTabs, PANEL_ID, tabId } from './MonthTabs'
import { readStarterSkipped, StarterOffer } from './StarterOffer'
import { useMonthFormat } from './useMonthFormat'

type Adding = { date: ISODate; kind: 'expense' | 'income'; envelopeId?: Id }

// Envelopes (Full mode): twelve month tabs for this year. Each month has its money in, then
// one card per kind of spending with that month's budget, a bar of what is used, and every
// entry that counts against it. The yearly review sits at the end of the tabs.
export function EnvelopesScreen() {
  const today = useToday()
  const now = useNow()
  const model = useTodayModel(today, now)
  const { settings, update } = useAppSettings()
  const undoToast = useUndoToast()
  const navigate = useNavigate()
  const year = Number(today.slice(0, 4))
  const currentMonth = today.slice(0, 7)
  const { months, rowDay } = useMonthFormat(year)
  // In the URL, so a reload or Back keeps the month; anything not in this year means "now".
  const [params, setParams] = useSearchParams()
  const asked = params.get('month')
  const month = asked && months.some((m) => m.key === asked) ? asked : currentMonth
  const monthName = months.find((m) => m.key === month)?.long ?? ''
  const span = useMemo(() => monthSpan(`${month}-01`), [month])
  const input = model.input
  const money = useMemo(() => (input ? moneyFor(input, span) : null), [input, span])

  const [adding, setAdding] = useState<Adding | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [renaming, setRenaming] = useState<Envelope | null>(null)
  const [creating, setCreating] = useState(false)
  const [skipped, setSkipped] = useState(readStarterSkipped)

  const on = settings.envelopesEnabled
  const envelopes = model.envelopes
  const fallback = envelopes.find((e) => e.isDefault)?.name ?? 'Everyday'
  // Offered while only Everyday exists: the moment right after turning envelopes on.
  const offerStarters = on && !skipped && envelopes.every((e) => e.isDefault)
  // "+ Add spend" lands on today when it is in the month, else on the month's first day.
  const dayInMonth = today >= span.start && today < span.end ? today : span.start

  function pick(key: string) {
    setParams(key === currentMonth ? {} : { month: key }, { replace: true })
  }

  async function turnOn() {
    // "Everyday" exists before the switch flips, so untagged spending always has a home.
    await ensureDefaultEnvelope()
    await update({ envelopesEnabled: true })
  }

  async function remove(env: Envelope) {
    await deleteEnvelope(env.id)
    undoToast(`Deleted ${env.name}. Its spending now counts as ${fallback}.`)
  }

  return (
    <>
      <PageHeader
        title="Envelopes"
        subtitle="A budget for each kind of spending, one month at a time."
      />
      <div className="space-y-5">
        <MonthTabs months={months} value={month} current={currentMonth} onChange={pick} />

        <div
          role="tabpanel"
          id={PANEL_ID}
          aria-labelledby={tabId(month)}
          className="space-y-4 sm:space-y-5"
        >
          {!model.loaded || !money ? (
            <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
          ) : (
            <>
              <IncomeCard
                monthName={monthName}
                paydays={money.flows.paydays}
                logged={money.flows.loggedIncome}
                rowDay={rowDay}
                onAdd={() => setAdding({ date: dayInMonth, kind: 'income' })}
                onEdit={setEditing}
              />

              {!on ? (
                <OffCard onTurnOn={() => void turnOn()} />
              ) : (
                <>
                  {envelopes.map((env) => (
                    <EnvelopeCard
                      key={env.id}
                      env={env}
                      usage={money.envelopes.find((u) => u.id === env.id)}
                      month={month}
                      monthName={monthName}
                      entries={envelopeEntries(env, envelopes, model.transactions, span)}
                      bills={linkedBillEntries(env.id, model.bills, model.occurrences, span)}
                      rowDay={rowDay}
                      onAddSpend={() =>
                        setAdding({ date: dayInMonth, kind: 'expense', envelopeId: env.id })
                      }
                      onRename={() => setRenaming(env)}
                      onDelete={() => void remove(env)}
                      onEdit={setEditing}
                    />
                  ))}
                  {offerStarters && <StarterOffer onSkip={() => setSkipped(true)} />}
                  <Button
                    variant="secondary"
                    block
                    size="lg"
                    icon="plus"
                    onClick={() => setCreating(true)}
                  >
                    Add envelope
                  </Button>
                  <div className="card-quiet flex items-center justify-between gap-4 px-5 py-3">
                    <p className="text-sm text-muted" id="envelopes-switch-hint">
                      <span className="block font-medium text-text">Use envelopes</span>
                      Turn off to go back to one shared pot. Nothing is deleted.
                    </p>
                    <Switch
                      label="Use envelopes"
                      checked
                      describedBy="envelopes-switch-hint"
                      onChange={() => void update({ envelopesEnabled: false })}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <AddEntrySheet
        date={adding?.date ?? null}
        envelopeId={adding?.envelopeId}
        initialKind={adding?.kind}
        onClose={() => setAdding(null)}
        onAddBill={() => {
          setAdding(null)
          void navigate('/bills?new=1')
        }}
      />
      <TransactionSheet tx={editing} onClose={() => setEditing(null)} />
      <RenameSheet envelope={renaming} onClose={() => setRenaming(null)} />
      <EnvelopeSheet
        open={creating}
        envelopes={envelopes}
        month={month}
        monthName={monthName}
        currentMonth={currentMonth}
        onClose={() => setCreating(false)}
      />
    </>
  )
}

/** Envelopes are optional: what they are, and one switch to start. */
function OffCard({ onTurnOn }: { onTurnOn: () => void }) {
  const f = useFormat()
  return (
    <section aria-labelledby="envelopes-off-title" className="card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="envelopes-off-title" className="section-title">
            Envelopes are off
          </h2>
          <p className="mt-1.5 text-body text-muted">
            An envelope is a monthly budget for one kind of spending, like{' '}
            <span className="text-text">Groceries {f.money(300 * 10 ** f.decimals)}</span>. Each one
            shows what is spent and what is left as the month goes.
          </p>
          <p className="mt-2 text-body text-muted">
            Off is fine too: everything then shares one Everyday pot.
          </p>
        </div>
        <Switch label="Use envelopes" checked={false} onChange={onTurnOn} />
      </div>
    </section>
  )
}
