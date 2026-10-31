import { useId, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { csvFile, csvFileName, transactionsToCsv } from '../../db/csv'
import {
  useDebts,
  useEnvelopes,
  useFunds,
  useIncomes,
  usePaydayOverrides,
  useTransactions,
} from '../../db/hooks'
import { deleteTransaction, updateTransaction } from '../../db/repos'
import { groupByDate } from '../../domain/bills'
import { addDays, isValidISODate } from '../../domain/dates'
import { dateTimeFormat } from '../../domain/intl'
import type { Cents } from '../../domain/money'
import { primaryIncome } from '../../domain/paySchedule'
import {
  ALL_TIME,
  filterLog,
  logMonths,
  logTotals,
  newestFirst,
  payPeriods,
  type LogRange,
} from '../../domain/transactionLog'
import type { Envelope, ISODate, Transaction } from '../../domain/types'
import { useToday } from '../../lib/useToday'
import { Button, buttonClass } from '../../ui/Button'
import { Chip } from '../../ui/Chip'
import { cx } from '../../ui/cx'
import { DateInput } from '../../ui/DateInput'
import { EnvelopeDot, EnvelopeLabel } from '../../ui/EnvelopeDot'
import { Field, inputClass } from '../../ui/Field'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Sheet } from '../../ui/Sheet'
import { Stat } from '../../ui/Stat'
import { useToast } from '../../ui/Toast'
import { SaveFileButton } from '../backup/SaveBackup'
import { useFormat } from '../bills/format'

const KINDS = [
  { value: 'spend', label: 'Spent' },
  { value: 'income', label: 'Got money' },
] as const

interface RangeOption {
  key: string
  label: string
  range: LogRange
}

const rangeKey = (r: LogRange) => (r.kind === 'all' ? 'all' : `${r.kind}:${r.start}`)

/**
 * More > Transactions: the log. Pick a pay period or a month, narrow by envelope or words,
 * see the count and the totals for exactly that selection. Tap an entry to fix or delete it.
 */
export function TransactionsScreen() {
  const f = useFormat()
  const today = useToday()
  const { locale } = useAppSettings().settings
  const transactions = useTransactions()
  const envelopes = useEnvelopes()
  const incomes = useIncomes()
  const overrides = usePaydayOverrides()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [envelopeId, setEnvelopeId] = useState<string | undefined>(undefined)
  const [query, setQuery] = useState('')

  const options = useMemo<RangeOption[]>(() => {
    const periods = payPeriods(incomes && primaryIncome(incomes), today, overrides ?? [], 4)
    const short = dateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    const shortYear = dateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    const monthLabel = (start: ISODate) =>
      (start.slice(0, 4) === today.slice(0, 4) ? short : shortYear).format(
        new Date(`${start}T00:00:00Z`),
      )
    return [
      ...periods.map((range, i) => ({
        key: rangeKey(range),
        range,
        label:
          i === 0
            ? 'This pay period'
            : i === 1
              ? 'Last pay period'
              : `${f.day(range.start)} – ${f.day(addDays(range.end, -1))}`,
      })),
      ...logMonths(transactions ?? [], today).map((range) => ({
        key: rangeKey(range),
        range,
        label: monthLabel(range.start),
      })),
      { key: 'all', range: ALL_TIME, label: 'All' },
    ]
  }, [incomes, overrides, transactions, today, locale, f])

  // Default: this pay period, or this month without a payday to anchor on.
  const selected = options.find((o) => o.key === picked) ?? options[0]!
  const inRange = useMemo(
    () => filterLog(transactions ?? [], { range: selected.range }),
    [transactions, selected.range],
  )
  const rows = useMemo(
    () => newestFirst(filterLog(inRange, { range: ALL_TIME, envelopeId, query })),
    [inRange, envelopeId, query],
  )
  const days = useMemo(() => [...groupByDate(rows)], [rows])
  const byId = new Map((envelopes ?? []).map((e) => [e.id, e]))
  // Only envelopes that appear in this selection, so a filter chip never shows nothing.
  const usedEnvelopes = (envelopes ?? []).filter((e) => inRange.some((t) => t.envelopeId === e.id))
  const hasUntagged = inRange.some((t) => t.envelopeId === undefined)
  const filtering = envelopeId !== undefined || query.trim() !== ''

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
      ) : transactions.length === 0 ? (
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
        <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="space-y-5 lg:sticky lg:top-10">
            <PeriodPicker
              options={options}
              value={selected.key}
              onChange={(key) => {
                setPicked(key)
                setEnvelopeId(undefined)
              }}
            />
            <Summary rows={rows} range={selected} transactions={transactions} />
            <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Search notes</span>
                <span className="relative block">
                  <Icon
                    name="search"
                    size={18}
                    className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search notes"
                    autoComplete="off"
                    enterKeyHint="search"
                    className={cx(inputClass, 'pl-11')}
                  />
                </span>
              </label>
              {(usedEnvelopes.length > 0 || envelopeId !== undefined) && (
                <EnvelopeFilter
                  envelopes={usedEnvelopes}
                  showNone={hasUntagged && usedEnvelopes.length > 0}
                  value={envelopeId}
                  onChange={setEnvelopeId}
                />
              )}
            </div>
          </div>

          <div className="mt-6 space-y-6 lg:mt-0">
            {days.length === 0 ? (
              <div className="card-quiet px-5 py-6 text-body text-muted">
                <p>
                  {filtering
                    ? 'Nothing matches in this period.'
                    : 'Nothing logged in this period yet.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {filtering && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQuery('')
                        setEnvelopeId(undefined)
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                  {selected.key !== 'all' && (
                    <Button variant="ghost" onClick={() => setPicked('all')}>
                      Show all entries
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              days.map(([date, dayRows]) => (
                <section key={date} className="space-y-2">
                  <h2 className="flex justify-between px-1 eyebrow text-muted">
                    <span>{dayLabel(date)}</span>
                    <span className="tabular-nums">
                      {f.money(dayRows.reduce((a, t) => a + t.amount, 0))}
                    </span>
                  </h2>
                  <ul className="card divide-y divide-line overflow-hidden">
                    {dayRows.map((t) => (
                      <TransactionRow
                        key={t.id}
                        tx={t}
                        envelope={t.envelopeId ? byId.get(t.envelopeId) : undefined}
                        onOpen={() => setEditing(t)}
                      />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </div>
      )}
      <TransactionSheet tx={editing} onClose={() => setEditing(null)} />
    </>
  )
}

function TransactionRow({
  tx: t,
  envelope,
  onOpen,
}: {
  tx: Transaction
  envelope: Envelope | undefined
  onOpen: () => void
}) {
  const f = useFormat()
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent-soft/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {t.note || (t.amount < 0 ? 'Spent' : 'Money in')}
          </span>
          {(envelope || t.inBalance) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {envelope && <EnvelopeLabel name={envelope.name} color={envelope.color} />}
              {t.inBalance && <span>Already in balance</span>}
            </span>
          )}
        </span>
        <span className="shrink-0 font-medium tabular-nums">
          {t.amount > 0 ? '+' : ''}
          {f.money(t.amount)}
        </span>
      </button>
    </li>
  )
}

/** Pay periods first (how Steady thinks), then month pills, then everything. */
function PeriodPicker({
  options,
  value,
  onChange,
}: {
  options: readonly RangeOption[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    // Scrolls sideways on a phone instead of wrapping into a wall of pills; wraps on desktop.
    <div
      role="group"
      aria-label="Period"
      className="-mx-4 flex gap-2 overflow-x-auto p-1.5 px-4 [scrollbar-width:none] lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0"
    >
      {options.map((o) => (
        <Chip
          key={o.key}
          selected={o.key === value}
          onClick={() => onChange(o.key)}
          className="shrink-0 whitespace-nowrap"
        >
          {o.label}
        </Chip>
      ))}
    </div>
  )
}

function EnvelopeFilter({
  envelopes,
  showNone,
  value,
  onChange,
}: {
  envelopes: readonly Envelope[]
  showNone: boolean
  value: string | undefined
  onChange: (id: string | undefined) => void
}) {
  const toggle = (id: string) => onChange(value === id ? undefined : id)
  return (
    <div role="group" aria-label="Envelope" className="flex flex-wrap gap-2">
      {envelopes.map((e) => (
        <Chip key={e.id} selected={value === e.id} onClick={() => toggle(e.id)}>
          <EnvelopeDot color={e.color} className="h-2 w-2" />
          {e.name}
        </Chip>
      ))}
      {showNone && (
        <Chip selected={value === 'none'} onClick={() => toggle('none')}>
          No envelope
        </Chip>
      )}
    </div>
  )
}

/** Count and totals for exactly what's listed, and that same list as a CSV. */
function Summary({
  rows,
  range,
  transactions,
}: {
  rows: readonly Transaction[]
  range: RangeOption
  transactions: readonly Transaction[]
}) {
  const f = useFormat()
  const today = useToday()
  const toast = useToast()
  const { currency, decimals } = useAppSettings().settings
  const envelopes = useEnvelopes()
  const funds = useFunds()
  const debts = useDebts()
  const totals = logTotals(rows)
  // Built as the list changes, never in the tap: iOS share must run inside the click.
  const file = useMemo(() => {
    if (rows.length === 0) return undefined
    const text = transactionsToCsv([...rows], { currency, decimals, envelopes, funds, debts })
    const name =
      range.range.kind === 'all'
        ? csvFileName('transactions', today)
        : `steady-transactions-${range.range.start}-to-${addDays(range.range.end, -1)}.csv`
    return csvFile(name, text)
  }, [rows, currency, decimals, envelopes, funds, debts, range, today])

  return (
    <section aria-label="Totals" className="card p-5">
      <p className="text-sm text-muted">
        {range.label} · {totals.count} of {transactions.length}{' '}
        {transactions.length === 1 ? 'entry' : 'entries'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <Stat label="Money out" value={f.money(totals.out)} size="sm" />
        <Stat label="Money in" value={f.money(totals.in)} size="sm" />
      </div>
      {file && (
        <SaveFileButton
          file={file}
          label="Export for spreadsheets (CSV)"
          variant="secondary"
          size="md"
          className="mt-4"
          onSaved={() => toast.show({ message: 'Exported. Open it in any spreadsheet app.' })}
        />
      )}
    </section>
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
