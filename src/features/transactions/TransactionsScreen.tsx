import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { csvFile, csvFileName, csvNames, transactionsToCsv } from '../../db/csv'
import {
  useCheckIns,
  useEnvelopes,
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
import { historyStart } from '../../domain/review'
import {
  ALL_TIME,
  filterLog,
  logTotals,
  logYears,
  newestFirst,
  payInRange,
  payPeriods,
  yearMonths,
  type LogRange,
} from '../../domain/transactionLog'
import type { Envelope, Transaction } from '../../domain/types'
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
  /** Full name where the chip is short ("October 2026" for "Oct"). */
  name?: string
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
  // Every envelope, deleted ones too: an entry keeps its envelope until the 30-day purge,
  // so its label, its filter chip and the CSV still name it.
  const names = useLiveQuery(csvNames)
  const envelopes = useMemo(
    () => names && [...names.envelopes].sort((a, b) => a.sort - b.sort),
    [names],
  )
  const incomes = useIncomes()
  const overrides = usePaydayOverrides()
  const checkIns = useCheckIns()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  // Plan's envelope sheet links here with ?envelope=<id> ("See all in log").
  const [searchParams] = useSearchParams()
  const [envelopeId, setEnvelopeId] = useState<string | undefined>(
    () => searchParams.get('envelope') || undefined,
  )
  const [query, setQuery] = useState('')

  const [pickedYear, setPickedYear] = useState<string | null>(null)

  // Pay periods first (how Steady thinks), then everything. Months get their own row.
  const periods = useMemo<RangeOption[]>(() => {
    const ranges = payPeriods(incomes && primaryIncome(incomes), today, overrides ?? [], 4)
    return [
      ...ranges.map((range, i) => ({
        key: rangeKey(range),
        range,
        label:
          i === 0
            ? 'This pay period'
            : i === 1
              ? 'Last pay period'
              : `${f.day(range.start)} – ${f.day(addDays(range.end, -1))}`,
      })),
      { key: 'all', range: ALL_TIME, label: 'All' },
    ]
  }, [incomes, overrides, today, f])

  const years = useMemo(() => logYears(transactions ?? [], today), [transactions, today])
  // Every month of every year with entries, so a picked month is found whichever year shows.
  const months = useMemo(() => {
    const short = dateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    const long = dateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    return years.flatMap((year) =>
      yearMonths(year, today).map((range) => {
        const at = new Date(`${range.start}T00:00:00Z`)
        return { key: rangeKey(range), range, label: short.format(at), name: long.format(at) }
      }),
    )
  }, [years, today, locale])

  // Default: this pay period, or this month without a payday to anchor on.
  const thisMonth = months.find((m) => m.range.start === `${today.slice(0, 7)}-01`)
  const selected =
    [...periods, ...months].find((o) => o.key === picked) ??
    (periods.length > 1 ? periods[0]! : (thisMonth ?? periods[0]!))
  const year =
    pickedYear ?? (selected.range.kind === 'month' ? selected.range.start.slice(0, 4) : years[0]!)
  const pick = (key: string) => {
    setPicked(key)
    setEnvelopeId(undefined)
  }

  const inRange = useMemo(
    () => filterLog(transactions ?? [], { range: selected.range }),
    [transactions, selected.range],
  )
  const rows = useMemo(
    () => newestFirst(filterLog(inRange, { range: ALL_TIME, envelopeId, query })),
    [inRange, envelopeId, query],
  )
  // Paydays in the selection count as money in, as on Plan and in Look back. Not with an
  // envelope or a search picked: pay belongs to neither.
  const pay = useMemo(() => {
    if (!incomes || !overrides || !checkIns || !transactions) return 0
    const since = historyStart({ today, transactions, checkIns })
    return payInRange(incomes, overrides, selected.range, today, since)
  }, [incomes, overrides, checkIns, transactions, selected.range, today])
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
            <div className="space-y-2">
              <ChipRow label="Period" options={periods} value={selected.key} onChange={pick} />
              <MonthRow
                years={years}
                year={year}
                onYear={setPickedYear}
                months={months.filter((m) => m.range.start.startsWith(year))}
                value={selected.key}
                onChange={pick}
              />
            </div>
            <Summary
              rows={rows}
              range={selected}
              transactions={transactions}
              names={names}
              pay={envelopeId || query.trim() ? 0 : pay}
            />
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
  // A move into savings or a debt payment leaves the balance but isn't spending: say so.
  const kind = t.fundId
    ? t.amount < 0
      ? 'Into savings'
      : 'From savings'
    : t.debtId
      ? 'Debt payment'
      : null
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
          {(envelope || t.inBalance || kind) && (
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              {envelope && <EnvelopeLabel name={envelope.name} color={envelope.color} />}
              {kind && <span>{kind}</span>}
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

// `relative`: the chips' sr-only spans are absolutely positioned, and without a positioned
// ancestor they escape the scroller and widen the page.
const rowClass =
  'relative -mx-4 flex scroll-px-4 gap-2 overflow-x-auto p-1.5 px-4 [scrollbar-width:none] min-[400px]:-mx-5 min-[400px]:scroll-px-5 min-[400px]:px-5 md:-mx-1.5 md:scroll-px-1.5 md:px-1.5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0'

function ChipRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly (RangeOption & { name?: string })[]
  value: string
  onChange: (key: string) => void
}) {
  // On a phone the row starts at January, so October would sit off screen. Bring the
  // picked chip (or, with none, the latest month) into view: scrollLeft, not
  // scrollIntoView, so the page itself never jumps.
  const ref = useRef<HTMLDivElement>(null)
  // Only when the chips or the pick change, so a re-render never undoes a manual scroll.
  const keys = options.map((o) => o.key).join()
  const months = options.some((o) => o.range.kind === 'month')
  useEffect(() => {
    const row = ref.current
    if (!row || row.scrollWidth <= row.clientWidth) return
    const chip =
      row.querySelector<HTMLElement>('[aria-pressed="true"]') ??
      (months ? (row.lastElementChild as HTMLElement | null) : null)
    if (!chip) return
    // The row is `relative`, so offsetLeft is already measured from its edge.
    const left = chip.offsetLeft
    // 16px of breathing room on whichever side it was hidden, so a chip (and its focus
    // ring) never sits clipped against the row's edge.
    if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left - 16)
    else if (left + chip.offsetWidth > row.scrollLeft + row.clientWidth)
      row.scrollLeft = left + chip.offsetWidth - row.clientWidth + 16
  }, [keys, months, value])

  return (
    // Scrolls sideways on a phone instead of wrapping into a wall of pills; wraps on desktop.
    <div ref={ref} role="group" aria-label={label} className={rowClass}>
      {options.map((o) => (
        <Chip
          key={o.key}
          selected={o.key === value}
          onClick={() => onChange(o.key)}
          className="shrink-0 whitespace-nowrap"
        >
          {o.label}
          {/* Heard as "Oct 2026": the year is in the row's label, but not in each chip. */}
          {o.range.kind === 'month' && (
            <span className="sr-only"> {o.range.start.slice(0, 4)}</span>
          )}
        </Chip>
      ))}
    </div>
  )
}

/**
 * The months of one year, January to December (or to now). A year switch appears only
 * once entries span more than one year, so most people never see it.
 */
function MonthRow({
  years,
  year,
  onYear,
  months,
  value,
  onChange,
}: {
  years: readonly string[]
  year: string
  onYear: (year: string) => void
  months: readonly (RangeOption & { name: string })[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div className="space-y-2">
      {years.length > 1 && (
        <div role="group" aria-label="Year" className={rowClass}>
          {years.map((y) => (
            <Chip
              key={y}
              selected={y === year}
              onClick={() => onYear(y)}
              className="shrink-0 tabular-nums"
            >
              {y}
            </Chip>
          ))}
        </div>
      )}
      <ChipRow label={`Months in ${year}`} options={months} value={value} onChange={onChange} />
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
  names,
  pay,
}: {
  rows: readonly Transaction[]
  range: RangeOption
  transactions: readonly Transaction[]
  names: Awaited<ReturnType<typeof csvNames>> | undefined
  /** Paydays in the range (not entries in the log), counted into Money in. */
  pay: Cents
}) {
  const f = useFormat()
  const today = useToday()
  const toast = useToast()
  const { currency, decimals } = useAppSettings().settings
  const totals = logTotals(rows)
  // Built as the list changes, never in the tap: iOS share must run inside the click.
  const file = useMemo(() => {
    if (rows.length === 0 || !names) return undefined
    const text = transactionsToCsv([...rows], { currency, decimals, ...names })
    const name =
      range.range.kind === 'all'
        ? csvFileName('transactions', today)
        : `steady-transactions-${range.range.start}-to-${addDays(range.range.end, -1)}.csv`
    return csvFile(name, text)
  }, [rows, currency, decimals, names, range, today])

  return (
    <section aria-label="Totals" className="card p-5">
      <p className="text-sm text-muted">
        {range.name ?? range.label} · {totals.count} of {transactions.length}{' '}
        {transactions.length === 1 ? 'entry' : 'entries'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Money out" value={f.money(totals.out)} size="sm" />
        <Stat
          label="Money in"
          value={f.money(totals.in + pay)}
          hint={pay > 0 ? `Pay included: ${f.money(pay)}` : undefined}
          size="sm"
        />
        <Stat label="Entries" value={totals.count} size="sm" />
        {/* Per side: a salary would swamp a mixed average. Spending is the usual question. */}
        {totals.outCount > 0 || totals.inCount === 0 ? (
          <Stat label="Average spend" value={f.money(totals.averageOut)} size="sm" />
        ) : (
          <Stat label="Average in" value={f.money(totals.averageIn)} size="sm" />
        )}
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

export function TransactionSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  return (
    <Sheet open={tx !== null} onClose={onClose} title="Edit entry">
      {tx && <TransactionForm key={tx.id} tx={tx} onClose={onClose} />}
    </Sheet>
  )
}

function TransactionForm({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const f = useFormat()
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
