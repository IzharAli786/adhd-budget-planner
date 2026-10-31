import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { useEnvelopes, useTransactions } from '../../db/hooks'
import { deleteTransaction, updateTransaction } from '../../db/repos'
import { groupByDate } from '../../domain/bills'
import { isValidISODate } from '../../domain/dates'
import type { Cents } from '../../domain/money'
import type { Transaction } from '../../domain/types'
import { useToday } from '../../lib/useToday'
import { Button, buttonClass } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { DateInput } from '../../ui/DateInput'
import { Field, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { useFormat } from '../bills/format'

const KINDS = [
  { value: 'spend', label: 'Spent' },
  { value: 'income', label: 'Got money' },
] as const

/** More > Transactions: every entry by day, newest first. Tap one to fix or delete it. */
export function TransactionsScreen() {
  const f = useFormat()
  const today = useToday()
  const transactions = useTransactions()
  const envelopes = useEnvelopes()
  const [editing, setEditing] = useState<Transaction | null>(null)

  const days = useMemo(() => {
    const newest = [...(transactions ?? [])].sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    )
    return [...groupByDate(newest)]
  }, [transactions])
  const envelopeName = new Map((envelopes ?? []).map((e) => [e.id, e.name]))

  const dayLabel = (d: string) => {
    const rel = f.relative(d, today)
    return rel === 'today' || rel === 'yesterday'
      ? rel[0]!.toUpperCase() + rel.slice(1)
      : f.dayLong(d)
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="Everything you’ve logged. Tap one to change it."
        back={{ to: '/more', label: 'More' }}
      />
      {transactions === undefined ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : days.length === 0 ? (
        <EmptyState
          art="notebook"
          title="Nothing logged yet"
          action={
            <Link to="/" className={buttonClass()}>
              Go to Today
            </Link>
          }
        >
          Type “12 coffee” on Today and it shows up here.
        </EmptyState>
      ) : (
        // Wider on desktop, but not so wide that a note and its amount drift apart.
        <div className="space-y-6 lg:max-w-4xl">
          {days.map(([date, rows]) => (
            <section key={date} className="space-y-2">
              <h2 className="flex justify-between px-1 eyebrow text-muted">
                <span>{dayLabel(date)}</span>
                <span className="tabular-nums">
                  {f.money(rows.reduce((a, t) => a + t.amount, 0))}
                </span>
              </h2>
              <ul className="card divide-y divide-line overflow-hidden">
                {rows.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent-soft/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {t.note || (t.amount < 0 ? 'Spent' : 'Money in')}
                        </span>
                        {(t.envelopeId || t.inBalance) && (
                          <span className="block text-sm text-muted">
                            {[
                              t.envelopeId && envelopeName.get(t.envelopeId),
                              t.inBalance && 'Already in balance',
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {t.amount > 0 ? '+' : ''}
                        {f.money(t.amount)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <TransactionSheet tx={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function TransactionSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  return (
    <Sheet open={tx !== null} onClose={onClose} title="Edit entry">
      {tx && <TransactionForm key={tx.id} tx={tx} onClose={onClose} />}
    </Sheet>
  )
}

function TransactionForm({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const f = useFormat()
  const today = useToday()
  const { settings } = useAppSettings()
  const envelopes = useEnvelopes()
  const undoToast = useUndoToast()
  const noteId = useId()
  const [amount, setAmount] = useState<Cents | null>(Math.abs(tx.amount))
  const [kind, setKind] = useState<'spend' | 'income'>(tx.amount < 0 ? 'spend' : 'income')
  const [note, setNote] = useState(tx.note)
  const [date, setDate] = useState(tx.date)
  const [envelopeId, setEnvelopeId] = useState(tx.envelopeId)
  const [tried, setTried] = useState(false)
  const label = tx.note || 'entry'

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTried(true)
    if (!amount || !isValidISODate(date)) return
    const patch: Partial<Transaction> = {
      amount: kind === 'spend' ? -amount : amount,
      note: note.trim(),
      date,
    }
    if (envelopeId !== tx.envelopeId) patch.envelopeId = envelopeId
    await updateTransaction(tx.id, patch)
    undoToast(`Saved ${note.trim() || 'entry'}`)
    onClose()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-4" noValidate>
      <MoneyInput
        label="Amount"
        value={amount}
        onChange={setAmount}
        symbol={f.symbol}
        decimals={f.decimals}
        error={tried && !amount ? 'Enter an amount' : undefined}
      />
      <Segmented label="Money" value={kind} options={KINDS} onChange={setKind} />
      <Field id={noteId} label="What for">
        <input
          id={noteId}
          type="text"
          value={note}
          autoComplete="off"
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
        />
      </Field>
      <DateInput
        format={f.dayFull}
        label="Date"
        value={date}
        max={today}
        onChange={setDate}
        error={tried && !isValidISODate(date) ? 'Pick a date' : undefined}
      />
      {settings.envelopesEnabled && (envelopes?.length ?? 0) > 0 && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Envelope</legend>
          <div className="flex flex-wrap gap-2">
            {envelopes!.map((env) => (
              <Chip
                key={env.id}
                selected={envelopeId === env.id}
                onClick={() => setEnvelopeId(envelopeId === env.id ? undefined : env.id)}
              >
                {env.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          variant="danger"
          onClick={async () => {
            await deleteTransaction(tx.id)
            undoToast(`Deleted ${label}`)
            onClose()
          }}
        >
          <Icon name="trash" size={18} />
          Delete
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
