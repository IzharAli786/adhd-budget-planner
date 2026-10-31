import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import {
  useCheckIns,
  useFunds,
  useIncomes,
  usePaydayOverrides,
  useTransactions,
} from '../../db/hooks'
import { addDays } from '../../domain/dates'
import { paydayEntriesBetween } from '../../domain/bills'
import { periodIncome, type PeriodIncome } from '../../domain/plan'
import { simpleLines, type SafeToSpend } from '../../domain/safeToSpend'
import { fundPace, fundProgress, fundSaved } from '../../domain/savings'
import type { Cents, ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { buttonClass } from '../../ui/Button'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { ProgressBar } from '../../ui/Progress'
import { StatStrip } from '../../ui/StatStrip'
import { useFormat, type Formatters } from '../bills/format'
import { PaydayNote } from '../notes/PaydayNote'
import { paceText, SavingsTiles, usePaydays } from '../goals/FundsSection'
import { CanFitForm } from '../today/CanFitSheet'
import { useTodayModel, type TodayModel } from '../today/useTodayModel'
import { InsightsSection } from '../review/InsightsSection'
import { useReviewData } from '../review/useReviewData'
import { EnvelopesSection } from './EnvelopesSection'
import { PastPeriod, PeriodNav } from './PastPeriod'
import type { DateRange } from '../../domain/insights'

// Plan (Full mode, PLAN §5): where this paycheck goes. The same planToday() result as
// Today, so the numbers here can never disagree with the hero.
export function PlanScreen() {
  const today = useToday()
  const now = useNow()
  const model = useTodayModel(today, now)
  const data = useReviewData(today)
  // A past pay period shown read-only; null is the current one.
  const [viewing, setViewing] = useState<DateRange | null>(null)
  const income = usePeriodIncome(model)

  return (
    <>
      <PageHeader
        title="Plan"
        subtitle={viewing ? 'A look back at an earlier paycheck.' : 'Where this paycheck goes.'}
      />
      {!model.loaded || !model.plan ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : model.plan.kind !== 'ready' ? (
        <div className="space-y-8">
          <EmptyState
            art="sunrise"
            title="One number first"
            action={
              <Link to="/" className={buttonClass()}>
                Go to Today
              </Link>
            }
          >
            Add your payday and today’s balance on Today, and your plan fills in here.
          </EmptyState>
          <EnvelopesSection envelopes={model.envelopes} usage={[]} />
        </div>
      ) : (
        <div className="space-y-8">
          {data && (
            <PeriodNav
              data={data}
              current={model.plan.period}
              viewing={viewing}
              onView={setViewing}
            />
          )}
          {viewing && data ? (
            <PastPeriod data={data} range={viewing} />
          ) : (
            <CurrentPlan model={model} today={today} data={data} income={income} />
          )}
        </div>
      )}
    </>
  )
}

function CurrentPlan({
  model,
  today,
  data,
  income,
}: {
  model: TodayModel
  today: ISODate
  data: ReturnType<typeof useReviewData>
  income: PeriodIncome | null
}) {
  const { settings } = useAppSettings()
  const plan = model.plan
  if (plan?.kind !== 'ready') return null
  return (
    <>
      {income && <PlanStrip model={model} income={income} />}
      {/* Desktop: the period and the "try a price" box side by side, then envelopes
          beside savings. Phones keep the same order in one column. */}
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        {income && <PeriodCard model={model} today={today} income={income} />}
        <section aria-labelledby="fit-title" className="card p-5">
          <h2 id="fit-title" className="mb-1 text-heading">
            Can this fit?
          </h2>
          <p className="mb-4 text-body text-muted">Try a price. Nothing is saved.</p>
          <CanFitForm
            total={plan.safe.total}
            runway={plan.runway}
            envelopes={settings.envelopesEnabled ? plan.safe.envelopes : []}
          />
        </section>
      </div>
      <PaydayNote periodStart={plan.period.start} />
      <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
        <EnvelopesSection envelopes={model.envelopes} usage={plan.safe.envelopes} />
        <SavingsSummary today={today} />
      </div>
      {data && <InsightsSection data={data} range={plan.period} />}
    </>
  )
}

/** This period's pay, or the next pay in the first period (see periodIncome). */
function usePeriodIncome(model: TodayModel): PeriodIncome | null {
  const incomes = useIncomes()
  const overrides = usePaydayOverrides()
  const checkIns = useCheckIns()
  const period = model.plan?.kind === 'ready' ? model.plan.period : null
  return useMemo(() => {
    if (!incomes || !overrides || !checkIns || !period) return null
    const firstBalance = checkIns.reduce<ISODate | undefined>(
      (min, c) => (min === undefined || c.date < min ? c.date : min),
      undefined,
    )
    return periodIncome(
      paydayEntriesBetween(incomes, overrides, period.start, period.end),
      paydayEntriesBetween(incomes, overrides, period.end, addDays(period.end, 1)),
      firstBalance,
    )
  }, [incomes, overrides, checkIns, period])
}

// simpleLines gives each deduction as a negative line (it adds up to the total). Shown on
// its own, "Set aside −€300" reads like money lost, so the summary shows what is held
// back as a plain amount: never below zero, never with a minus sign.
const held = (line: Cents) => Math.max(0, -line)

/** How far the envelopes went past their budgets this period, in total. */
const overBudget = (safe: SafeToSpend) => safe.envelopes.reduce((a, e) => a + e.over, 0)

const overNote = (f: Formatters, over: Cents) =>
  `Over budget by ${f.money(over)} in envelopes this period`

const incomeLabel = (income: PeriodIncome) =>
  income.kind === 'expected' ? 'Expected pay' : 'Income this period'

/** Income · Set aside · Safe to spend, above the detail. */
function PlanStrip({ model, income }: { model: TodayModel; income: PeriodIncome }) {
  const f = useFormat()
  if (model.plan?.kind !== 'ready') return null
  const { safe, period } = model.plan
  const [, , setAside, total] = simpleLines(safe)
  const over = overBudget(safe)
  return (
    <StatStrip
      label="This period at a glance"
      items={[
        {
          label: incomeLabel(income),
          value: f.money(income.total),
          hint:
            income.kind === 'expected'
              ? `On ${f.day(period.end)}`
              : `${f.day(period.start)} – ${f.day(addDays(period.end, -1))}`,
        },
        {
          label: 'Set aside',
          value: f.money(held(setAside!.amount)),
          hint: over > 0 ? overNote(f, over) : 'Savings, envelopes, buffer',
        },
        {
          label: safe.status === 'short' ? 'Short until payday' : 'Safe to spend',
          value: f.money(total!.amount),
          hint: `Until payday · ${f.day(period.end)}`,
        },
      ]}
    />
  )
}

function PeriodCard({
  model,
  today,
  income,
}: {
  model: TodayModel
  today: ISODate
  income: PeriodIncome
}) {
  const f = useFormat()
  const plan = model.plan
  if (plan?.kind !== 'ready') return null
  const { period } = plan
  const pay = income.entries
  const [balance, bills, setAside, total] = simpleLines(plan.safe)
  const over = overBudget(plan.safe)

  return (
    <section aria-labelledby="period-title" className="card p-5">
      <p className="text-sm text-muted">
        {f.day(period.start)} – {f.day(addDays(period.end, -1))} · {period.daysLeft}{' '}
        {period.daysLeft === 1 ? 'day' : 'days'} left
      </p>
      <h2 id="period-title" className="mt-0.5 text-heading">
        This period
      </h2>
      <dl className="mt-4 divide-y divide-line text-body">
        <Row
          label={
            income.kind === 'expected' ? `Expected pay · ${f.day(period.end)}` : incomeLabel(income)
          }
          value={f.money(income.total)}
        >
          {/* The expected pay is the label itself; a breakdown would only repeat it. */}
          {income.kind === 'received' && pay.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm text-muted">
              {pay.map((p) => (
                <li key={`${p.incomeId}|${p.nominal}`} className="flex justify-between gap-4">
                  <span className="truncate">
                    {p.name} · {f.day(p.date)}
                    {p.date > today && ' (coming)'}
                  </span>
                  <span className="shrink-0 tabular-nums">{f.money(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Balance now" value={f.money(balance!.amount)} />
        <Row label="Bills before payday" value={f.money(held(bills!.amount))} />
        <Row label="Set aside" value={f.money(held(setAside!.amount))}>
          {over > 0 && <p className="mt-1 text-sm text-muted">{overNote(f, over)}</p>}
        </Row>
        <Row
          label={plan.safe.status === 'short' ? 'Short until payday' : 'Safe to spend'}
          value={f.money(total!.amount)}
          strong
        />
      </dl>
      <p className="mt-3 text-sm text-muted">{plan.safe.estimateNote}</p>
    </section>
  )
}

function Row({
  label,
  value,
  strong,
  children,
}: {
  label: string
  value: string
  strong?: boolean
  children?: React.ReactNode
}) {
  return (
    // A <dl> allows one <div> per group, no deeper (axe definition-list): the breakdown is
    // a second <dd> that wraps to its own line, not a sibling of an inner row <div>.
    <div className="flex flex-wrap justify-between gap-x-4 py-2.5">
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd className={strong ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}>
        {value}
      </dd>
      {children && <dd className="w-full">{children}</dd>}
    </div>
  )
}

function SavingsSummary({ today }: { today: ISODate }) {
  const f = useFormat()
  const funds = useFunds()
  const transactions = useTransactions()
  const paydays = usePaydays(today)
  if (!funds || !transactions || !paydays) return null

  return (
    <section aria-labelledby="savings-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="savings-title" className="text-heading">
          Savings
        </h2>
        <Link to="/goals" className={buttonClass('ghost')}>
          Open Goals
        </Link>
      </div>
      <SavingsTiles funds={funds} transactions={transactions} />
      {funds.length === 0 ? (
        <p className="card p-5 text-body text-muted">
          No savings funds yet. Start one in Goals; even a little each payday adds up.
        </p>
      ) : (
        <ul className="card divide-y divide-line">
          {funds.map((fund) => {
            const saved = fundSaved(fund, transactions)
            const pace = paceText(fundPace(fund, saved, today, paydays), fund.perPeriod, f)
            return (
              <li key={fund.id} className="px-5 py-3.5">
                <div className="flex justify-between gap-4 text-body">
                  <span className="truncate font-medium">{fund.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {f.money(saved)}
                    {fund.target !== undefined && (
                      <span className="text-muted"> / {f.money(fund.target)}</span>
                    )}
                  </span>
                </div>
                {fund.target !== undefined && (
                  <ProgressBar
                    value={fundProgress(saved, fund.target)}
                    label={`${fund.name} progress`}
                    className="mt-2"
                  />
                )}
                <p className="mt-1 text-sm text-muted">
                  {fund.perPeriod > 0
                    ? `${f.money(fund.perPeriod)} set aside each payday`
                    : 'Whatever fits, when it fits'}
                </p>
                {pace && <p className="mt-0.5 text-sm text-muted">{pace}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
