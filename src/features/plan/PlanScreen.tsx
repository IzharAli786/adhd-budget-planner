import { useMemo } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useFunds, useIncomes, usePaydayOverrides, useTransactions } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import { paydayEntriesBetween } from '../../domain/bills'
import { simpleLines } from '../../domain/safeToSpend'
import { fundProgress, fundSaved } from '../../domain/savings'
import type { ISODate } from '../../domain/types'
import { useToday } from '../../lib/useToday'
import { buttonClass } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { ProgressBar } from '../../ui/Progress'
import { useFormat } from '../bills/format'
import { CanFitForm } from '../today/CanFitSheet'
import { useTodayModel, type TodayModel } from '../today/useTodayModel'
import { EnvelopesSection } from './EnvelopesSection'

// Plan (Full mode, PLAN §5): where this paycheck goes. The same planToday() result as
// Today, so the numbers here can never disagree with the hero.
export function PlanScreen() {
  const today = useToday()
  const model = useTodayModel(today)
  const { settings } = useAppSettings()

  return (
    <>
      <PageHeader title="Plan" subtitle="Where this paycheck goes." />
      {!model.loaded || !model.plan ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : model.plan.kind !== 'ready' ? (
        <div className="space-y-8">
          <EmptyState icon={<Icon name="plan" size={26} />} title="One number first">
            Add your payday and today’s balance on Today, and your plan fills in here.
            <Link to="/" className={`${buttonClass()} mt-4`}>
              Go to Today
            </Link>
          </EmptyState>
          <EnvelopesSection envelopes={model.envelopes} usage={[]} />
        </div>
      ) : (
        <div className="space-y-8">
          <PeriodCard model={model} today={today} />
          <section
            aria-labelledby="fit-title"
            className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line"
          >
            <h2 id="fit-title" className="mb-1 text-lg font-semibold">
              Can this fit?
            </h2>
            <p className="mb-4 text-[0.9375rem] text-muted">Try a price. Nothing is saved.</p>
            <CanFitForm
              total={model.plan.safe.total}
              runway={model.plan.runway}
              envelopes={settings.envelopesEnabled ? model.plan.safe.envelopes : []}
            />
          </section>
          <EnvelopesSection envelopes={model.envelopes} usage={model.plan.safe.envelopes} />
          <SavingsSummary />
        </div>
      )}
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
    <section
      aria-labelledby="period-title"
      className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line"
    >
      <p className="text-sm text-muted">
        {f.day(period.start)} – {f.day(addDays(period.end, -1))} · {period.daysLeft}{' '}
        {period.daysLeft === 1 ? 'day' : 'days'} left
      </p>
      <h2 id="period-title" className="mt-0.5 text-lg font-semibold">
        This period
      </h2>
      <dl className="mt-4 divide-y divide-line text-[0.9375rem]">
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
    <div className="py-2.5">
      <div className="flex justify-between gap-4">
        <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
        <dd className={strong ? 'font-semibold tabular-nums' : 'font-medium tabular-nums'}>
          {value}
        </dd>
      </div>
      {children}
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
        <h2 id="savings-title" className="text-lg font-semibold">
          Savings
        </h2>
        <Link to="/goals" className={buttonClass('ghost')}>
          Open Goals
        </Link>
      </div>
      {funds.length === 0 ? (
        <p className="rounded-3xl bg-surface p-5 text-[0.9375rem] text-muted shadow-card ring-1 ring-line">
          No savings funds yet. Start one in Goals; even a little each payday adds up.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-3xl bg-surface shadow-card ring-1 ring-line">
          {funds.map((fund) => {
            const saved = fundSaved(fund, transactions)
            return (
              <li key={fund.id} className="px-5 py-3.5">
                <div className="flex justify-between gap-4 text-[0.9375rem]">
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
