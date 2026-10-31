import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useFunds, useIncomes, usePaydayOverrides, useTransactions } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import { paydayEntriesBetween } from '../../domain/bills'
import { simpleLines } from '../../domain/safeToSpend'
import { fundProgress, fundSaved } from '../../domain/savings'
import type { ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { buttonClass } from '../../ui/Button'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { ProgressBar } from '../../ui/Progress'
import { useFormat } from '../bills/format'
import { PaydayNote } from '../notes/PaydayNote'
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
            <CurrentPlan model={model} today={today} data={data} />
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
}: {
  model: TodayModel
  today: ISODate
  data: ReturnType<typeof useReviewData>
}) {
  const { settings } = useAppSettings()
  const plan = model.plan
  if (plan?.kind !== 'ready') return null
  return (
    <>
      <PeriodCard model={model} today={today} />
      <PaydayNote periodStart={plan.period.start} />
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
      <EnvelopesSection envelopes={model.envelopes} usage={plan.safe.envelopes} />
      {data && <InsightsSection data={data} range={plan.period} />}
      <SavingsSummary />
    </>
  )
}

function PeriodCard({ model, today }: { model: TodayModel; today: ISODate }) {
  const f = useFormat()
  const incomes = useIncomes()
  const overrides = usePaydayOverrides()
  const plan = model.plan
  const period = plan?.kind === 'ready' ? plan.period : null
  const pay = useMemo(
    () =>
      incomes && overrides && period
        ? paydayEntriesBetween(incomes, overrides, period.start, period.end)
        : [],
    [incomes, overrides, period],
  )
  if (plan?.kind !== 'ready' || !period || !incomes || !overrides) return null

  const income = pay.reduce((a, p) => a + p.amount, 0)
  const [balance, bills, setAside, total] = simpleLines(plan.safe)

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
        <Row label="Income this period" value={f.money(income)}>
          {pay.length > 0 && (
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
        <Row label="Bills before payday" value={f.money(bills!.amount)} />
        <Row label="Set aside" value={f.money(setAside!.amount)} />
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

function SavingsSummary() {
  const f = useFormat()
  const funds = useFunds()
  const transactions = useTransactions()
  if (!funds || !transactions) return null

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
      {funds.length === 0 ? (
        <p className="card p-5 text-body text-muted">
          No savings funds yet. Start one in Goals; even a little each payday adds up.
        </p>
      ) : (
        <ul className="card divide-y divide-line">
          {funds.map((fund) => {
            const saved = fundSaved(fund, transactions)
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
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
