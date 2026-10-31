import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { addDays, maxDate } from '../../domain/dates'
import { compare, defaultBudget } from '../../domain/debt'
import { dateTimeFormat } from '../../domain/intl'
import {
  monthRanges,
  payPeriodRanges,
  periodSummaries,
  reviewYears,
  totalFlows,
  yearRange,
  type PeriodSummary,
  type ReviewMode,
} from '../../domain/review'
import type { ISODate } from '../../domain/types'
import { debtsInRange, fundsInRange } from '../../domain/yearSummary'
import { useToday } from '../../lib/useToday'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { Segmented } from '../../ui/Segmented'
import { Stat } from '../../ui/Stat'
import { useFormat, type Formatters } from '../bills/format'
import { carryLine } from './carry'
import { PrintReport, type PrintTarget } from './PrintReport'
import { useReviewData, type ReviewData } from './useReviewData'
import { DebtYearCard, SavingsYearCard } from './YearCards'

const IncomeOutChart = lazy(() => import('./IncomeOutChart'))

const MODES = [
  { value: 'month', label: 'Monthly' },
  { value: 'payday', label: 'Per payday' },
] as const

const utc = (d: ISODate) => new Date(`${d}T00:00:00Z`)

/** Short chart labels: "Jan" for a month, "30 Oct" for a pay period. Intl is cached. */
const axisLabel = (locale: string, mode: ReviewMode, start: ISODate) =>
  dateTimeFormat(
    locale,
    mode === 'month'
      ? { month: 'short', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', timeZone: 'UTC' },
  ).format(utc(start))

/**
 * Look back (More): a year of money in and out, by month or by pay period, with the
 * year's totals, a table, and a printable report. Read-only, and in both modes: looking
 * back is calm, not a tool to manage.
 */
export function ReviewScreen() {
  const today = useToday()
  const data = useReviewData(today)
  return (
    <>
      <div className="print-hide">
        <PageHeader
          title="Look back"
          subtitle="How the money moved, month by month or payday by payday."
          back={{ to: '/more', label: 'More' }}
        />
      </div>
      {!data ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : (
        <Review data={data} today={today} />
      )}
    </>
  )
}

function Review({ data, today }: { data: ReviewData; today: ISODate }) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const years = useMemo(() => reviewYears(data.input), [data])
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [mode, setMode] = useState<ReviewMode>('month')
  const [printing, setPrinting] = useState<PrintTarget | null>(null)

  const rows = useMemo(() => periodSummaries(year, mode, data.input), [year, mode, data])
  const totals = useMemo(() => totalFlows(rows), [rows])
  const periodsInYear = useMemo(
    () => payPeriodRanges(data.input, yearRange(year)).length || 12,
    [data, year],
  )
  const interest = useMemo(() => {
    const owing = data.debts.filter((d) => d.balance > 0)
    if (owing.length === 0) return null
    const result = compare(owing, defaultBudget(owing, 50 * 10 ** f.decimals))
    return 'error' in result ? null : result
  }, [data.debts, f.decimals])

  // The year as Look back counts it (from the start of the history), so the cards agree
  // with the tiles and the table.
  const yearSummary = useMemo(() => {
    const whole = yearRange(year)
    const counted = { start: maxDate(whole.start, data.input.since ?? whole.start), end: whole.end }
    const live = <T extends { deletedAt?: string }>(rows: T[]) =>
      rows.filter((r) => r.deletedAt === undefined)
    return {
      funds:
        live(data.funds).length > 0 ? fundsInRange(data.funds, data.transactions, counted) : [],
      debts:
        live(data.debts).length > 0
          ? debtsInRange(
              data.debts,
              data.bills,
              data.occurrences,
              data.transactions,
              counted,
              today,
            )
          : null,
    }
  }, [data, year, today])

  const periodName = (r: PeriodSummary) =>
    mode === 'month' ? f.month(r.start) : `${f.day(r.start)} – ${f.day(addDays(r.end, -1))}`
  // The row still in progress says so, so a month with only one payday in it yet doesn't
  // read as a month that went wrong.
  const rowLabel = (r: PeriodSummary) => periodName(r) + (r.end > today ? ' (so far)' : '')

  // Print once the report is in the DOM; afterprint puts the screen back.
  useEffect(() => {
    if (!printing) return
    const done = () => setPrinting(null)
    window.addEventListener('afterprint', done)
    window.print()
    return () => window.removeEventListener('afterprint', done)
  }, [printing])

  // Monthly keeps the rest of the year on the axis, so it reads as a year, but starts at
  // the month the history starts in: no empty slots for months Steady never saw.
  const points = useMemo(() => {
    const byStart = new Map(rows.map((r) => [r.start, r]))
    const since = data.input.since
    const ranges =
      mode === 'month'
        ? monthRanges(year).filter((m) => since === undefined || m.end > since)
        : rows
    return ranges.map((range) => {
      const r = byStart.get(range.start)
      return {
        key: range.start,
        label: axisLabel(settings.locale, mode, range.start),
        incomeIn: r?.incomeIn ?? 0,
        moneyOut: r?.moneyOut ?? 0,
      }
    })
  }, [rows, mode, year, settings.locale, data.input.since])

  const thisYear = year === Number(today.slice(0, 4))
  const active = rows.some((r) => r.incomeIn || r.moneyOut || r.saved)
  const latest = rows.at(-1)
  const unit = mode === 'month' ? 'month' : 'pay period'
  const when = thisYear ? 'this year' : `in ${year}`

  return (
    <>
      <div className={cx('space-y-7', printing && 'print-hide')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <YearSwitcher year={year} years={years} onChange={setYear} />
          <div className="w-full sm:w-64">
            <Segmented label="Show" value={mode} options={MODES} onChange={setMode} />
          </div>
        </div>

        {!active ? (
          <EmptyState art="notebook" title={`Nothing to look back on in ${year} yet`}>
            As you log spending, mark bills paid and check in on payday, each {unit} fills in here.
          </EmptyState>
        ) : (
          <>
            <section
              aria-label={`${year} at a glance`}
              className="grid grid-cols-2 gap-3 lg:grid-flow-col lg:grid-cols-none lg:auto-cols-fr"
            >
              <Tile
                label={totals.net >= 0 ? 'Left over' : 'More out than in'}
                value={f.money(Math.abs(totals.net))}
                hint={
                  totals.net >= 0
                    ? 'Money in, minus out and savings'
                    : 'Covered by what you already had'
                }
              />
              <Tile
                label={thisYear ? 'Saved this year' : `Saved in ${year}`}
                value={f.money(totals.saved)}
                hint="Moved into your funds"
              />
              <Tile
                label={thisYear ? 'Debt paid this year' : `Debt paid in ${year}`}
                value={f.money(totals.debtPaid)}
                hint="Minimums and extra payments"
              />
              {/* Only when the order matters: a tile saying "saves €0.00" tells nobody anything.
                  It looks ahead (interest until debt-free), unlike the debt card's figure. */}
              {interest && interest.interestSaved !== 0 && (
                <Tile
                  label={`${interest.interestSaved > 0 ? 'Avalanche' : 'Snowball'} could save`}
                  value={f.money(Math.abs(interest.interestSaved))}
                  hint={`Interest until debt-free, against ${interest.interestSaved > 0 ? 'snowball' : 'avalanche'} (estimate)`}
                />
              )}
            </section>

            {(yearSummary.funds.length > 0 || yearSummary.debts) && (
              <div className="grid gap-5 lg:grid-cols-2">
                {yearSummary.funds.length > 0 && (
                  <SavingsYearCard
                    funds={yearSummary.funds}
                    f={f}
                    title={thisYear ? 'Savings this year' : `Savings in ${year}`}
                    when={when}
                  />
                )}
                {yearSummary.debts && (
                  <DebtYearCard
                    debts={yearSummary.debts}
                    f={f}
                    title={thisYear ? 'Debt this year' : `Debt in ${year}`}
                    when={when}
                  />
                )}
              </div>
            )}

            <section aria-labelledby="flow-title" className="card p-5 sm:p-6">
              <h2 id="flow-title" className="text-heading">
                Money in and out
              </h2>
              <p className="mt-0.5 mb-4 text-body text-muted">
                Per {unit} in {year}.
              </p>
              <Suspense
                fallback={
                  <div aria-hidden="true" className="h-44 animate-pulse rounded-2xl bg-bg" />
                }
              >
                <IncomeOutChart
                  label={`Money in and out per ${unit}, ${year}. Every number is in the table below.`}
                  points={points}
                />
              </Suspense>
            </section>

            <section aria-labelledby="table-title" className="card p-5 sm:p-6">
              <h2 id="table-title" className="mb-3 text-heading">
                {mode === 'month' ? 'Month by month' : 'Payday by payday'}
              </h2>
              <PeriodTable
                rows={rows}
                totals={totals}
                f={f}
                rowLabel={rowLabel}
                payday={mode === 'payday'}
              />
              {mode === 'payday' && latest?.carried && (
                <p className="mt-4 text-body">{carryLine(latest.carried.amount, f.money)}</p>
              )}
              <p className="mt-3 text-sm text-muted">
                Out includes bills and debt payments; Debt shows that part on its own. Rebuilt from
                what you entered. Estimates only, not financial advice.
              </p>
            </section>

            <div className="flex flex-col gap-2 sm:flex-row">
              {latest && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPrinting({
                      kind: 'period',
                      range: { start: latest.start, end: latest.end },
                      title: periodName(latest),
                      payday: mode === 'payday',
                    })
                  }
                >
                  <Icon name="print" size={18} />
                  Print this period
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  setPrinting({
                    kind: 'year',
                    range: yearRange(year),
                    title: String(year),
                    rows,
                    rowLabel,
                    periods: periodsInYear,
                    funds: yearSummary.funds,
                    debts: yearSummary.debts,
                    when,
                  })
                }
              >
                <Icon name="print" size={18} />
                Print this year
              </Button>
            </div>
          </>
        )}
      </div>
      {printing && <PrintReport target={printing} data={data} f={f} today={today} />}
    </>
  )
}

function YearSwitcher({
  year,
  years,
  onChange,
}: {
  year: number
  years: number[]
  onChange: (y: number) => void
}) {
  const first = years[0] ?? year
  const last = years.at(-1) ?? year
  const step =
    'inline-flex size-11 items-center justify-center rounded-full text-accent hover:bg-accent-soft/60 disabled:text-muted disabled:opacity-40 disabled:hover:bg-transparent'
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous year"
        disabled={year <= first}
        onClick={() => onChange(year - 1)}
        className={step}
      >
        <Icon name="back" size={20} />
      </button>
      <h2 aria-live="polite" className="min-w-16 text-center text-heading tabular-nums">
        {year}
      </h2>
      <button
        type="button"
        aria-label="Next year"
        disabled={year >= last}
        onClick={() => onChange(year + 1)}
        className={step}
      >
        <Icon name="chevron" size={20} />
      </button>
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-quiet p-4">
      <Stat label={label} value={value} hint={hint} size="sm" />
    </div>
  )
}

function PeriodTable({
  rows,
  totals,
  f,
  rowLabel,
  payday,
}: {
  rows: PeriodSummary[]
  totals: ReturnType<typeof totalFlows>
  f: Formatters
  rowLabel: (r: PeriodSummary) => string
  payday: boolean
}) {
  const cell = 'py-2.5 pl-4 text-right whitespace-nowrap'
  return (
    // Six columns don't fit a phone: the table scrolls inside its card, never the page.
    <div
      className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6"
      tabIndex={0}
      role="region"
      aria-label="Period table"
    >
      <table className="w-full min-w-[32rem] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="py-2 font-medium">
              {payday ? 'Pay period' : 'Month'}
            </th>
            {payday && (
              <th scope="col" className={cx(cell, 'font-medium')}>
                Carried in
              </th>
            )}
            <th scope="col" className={cx(cell, 'font-medium')}>
              In
            </th>
            <th scope="col" className={cx(cell, 'font-medium')}>
              Out
            </th>
            <th scope="col" className={cx(cell, 'font-medium')}>
              Saved
            </th>
            <th scope="col" className={cx(cell, 'font-medium')}>
              Debt
            </th>
            <th scope="col" className={cx(cell, 'font-medium')}>
              Left over
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.start}>
              <th scope="row" className="py-2.5 text-left font-normal whitespace-nowrap">
                {rowLabel(r)}
              </th>
              {payday && <td className={cell}>{r.carried ? f.money(r.carried.amount) : '–'}</td>}
              <td className={cell}>{f.money(r.incomeIn)}</td>
              <td className={cell}>{f.money(r.moneyOut)}</td>
              <td className={cell}>{f.money(r.saved)}</td>
              <td className={cell}>{f.money(r.debtPaid)}</td>
              <td className={cx(cell, 'font-medium')}>{f.money(r.net)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line font-semibold">
            <th scope="row" className="py-2.5 text-left">
              Total
            </th>
            {payday && <td />}
            <td className={cell}>{f.money(totals.incomeIn)}</td>
            <td className={cell}>{f.money(totals.moneyOut)}</td>
            <td className={cell}>{f.money(totals.saved)}</td>
            <td className={cell}>{f.money(totals.debtPaid)}</td>
            <td className={cell}>{f.money(totals.net)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
