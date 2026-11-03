import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useFunds, useTransactions } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import type { SafeToSpend } from '../../domain/safeToSpend'
import { fundPace, fundProgress, fundSaved } from '../../domain/savings'
import { moneyFor, periodAt } from '../../domain/today'
import type { ISODate } from '../../domain/types'
import { useNow } from '../../lib/useNow'
import { useToday } from '../../lib/useToday'
import { buttonClass } from '../../ui/Button'
import { Disclosure } from '../../ui/Disclosure'
import { Icon } from '../../ui/Icon'
import { EmptyState, PageHeader } from '../../ui/PageHeader'
import { ProgressBar } from '../../ui/Progress'
import { StatStrip } from '../../ui/StatStrip'
import { useFormat } from '../bills/format'
import { PaydayNote } from '../notes/PaydayNote'
import { paceText, SavingsTiles, usePaydays } from '../goals/FundsSection'
import { CanFitForm } from '../today/CanFitSheet'
import { monthName } from '../today/Dashboard'
import { useTodayModel } from '../today/useTodayModel'
import { InsightsSection } from '../review/InsightsSection'
import { useReviewData } from '../review/useReviewData'
import { BudgetChart } from './BudgetChart'
import { EnvelopesSection } from './EnvelopesSection'
import { LeftToSpendBar, SpendingDonut } from './MoneyShape'
import type { DateRange } from '../../domain/insights'

const navButton =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-accent hover:bg-accent-soft/60 disabled:text-muted disabled:opacity-40 disabled:hover:bg-transparent'

// Plan (Full mode): any month (or pay period) at a glance. The same engine as Today's hero,
// so the current period here can never disagree with it.
export function PlanScreen() {
  const today = useToday()
  const now = useNow()
  const model = useTodayModel(today, now)
  const data = useReviewData(today)
  const { settings } = useAppSettings()
  const f = useFormat()
  // The period being looked at, by any date inside it; null is the current one.
  const [at, setAt] = useState<ISODate | null>(null)
  const input = model.input
  const span = useMemo(() => (input ? periodAt(input, at ?? today) : null), [input, at, today])
  const money = useMemo(() => (input && span ? moneyFor(input, span) : null), [input, span])
  const current = at === null || (span !== null && today >= span.start && today < span.end)
  const month = settings.planBy === 'month'
  const name = span
    ? month
      ? f.month(span.start)
      : `${f.day(span.start)} – ${f.day(addDays(span.end, -1))}`
    : ''

  return (
    <>
      <PageHeader
        title="Plan"
        subtitle={
          month
            ? 'Pick any month and see its whole picture.'
            : 'Pick any pay period and see its whole picture.'
        }
      />
      {!model.loaded || !model.plan || !input ? (
        <div aria-hidden="true" className="h-64 animate-pulse rounded-3xl bg-surface" />
      ) : !span || !money ? (
        <div className="space-y-8">
          <EmptyState
            art="sunrise"
            title="Add your payday first"
            action={
              <Link to="/bills?view=paydays" className={buttonClass()}>
                Add your payday
              </Link>
            }
          >
            Planning by pay period needs a payday. Or switch to calendar months in Money basics.
          </EmptyState>
        </div>
      ) : (
        <div className="space-y-8">
          <nav
            aria-label={month ? 'Months' : 'Pay periods'}
            className="-mt-3 flex items-center gap-2"
          >
            <button
              type="button"
              className={navButton}
              aria-label={month ? 'Previous month' : 'Previous pay period'}
              onClick={() => setAt(addDays(span.start, -1))}
            >
              <Icon name="back" size={20} />
            </button>
            <p className="min-w-0 flex-1 text-center font-display text-title" aria-live="polite">
              {name}
            </p>
            <button
              type="button"
              className={navButton}
              aria-label={month ? 'Next month' : 'Next pay period'}
              onClick={() => setAt(span.end)}
            >
              <Icon name="chevron" size={20} />
            </button>
            {!current && (
              <button
                type="button"
                onClick={() => setAt(null)}
                className="min-h-11 rounded-full px-3 text-sm font-medium text-accent hover:bg-accent-soft/60"
              >
                {month ? 'This month' : 'Now'}
              </button>
            )}
          </nav>

          <PlanStrip safe={money} current={current} future={span.start > today} />

          <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
            <PeriodCard safe={money} title={name} />
            {current ? (
              <Disclosure
                id="plan-fit"
                title="Can this fit?"
                summary="Try a price. Nothing is saved."
              >
                <p className="mt-1 mb-4 text-body text-muted">Try a price. Nothing is saved.</p>
                <CanFitForm
                  total={model.plan.kind === 'ready' ? model.plan.safe.total : 0}
                  runway={model.plan.kind === 'ready' ? model.plan.runway : NO_RUNWAY}
                  envelopes={settings.envelopesEnabled ? money.envelopes : []}
                />
              </Disclosure>
            ) : (
              <div />
            )}
          </div>

          {settings.envelopesEnabled && (
            <section aria-labelledby="bva-title" className="space-y-3">
              <h2 id="bva-title" className="px-1 text-heading">
                Budget vs actual — {month ? monthName(f, span.start) : 'this period'}
              </h2>
              <div className="card p-5 sm:p-6">
                {money.envelopes.some((e) => e.budget > 0 || e.spent + e.linkedDue > 0) ? (
                  <BudgetChart rows={money.envelopes} f={f} label={`Budget vs actual, ${name}`} />
                ) : (
                  <p className="text-body text-muted">
                    Give an envelope a budget below. As you add spending to it, planned vs actual
                    shows up here.
                  </p>
                )}
              </div>
            </section>
          )}

          <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
            <section aria-labelledby="dist-title" className="space-y-3">
              <h2 id="dist-title" className="px-1 text-heading">
                Spending distribution
              </h2>
              <div className="card p-5 sm:p-6">
                <SpendingDonut safe={money} f={f} />
              </div>
            </section>
            <section aria-labelledby="left-title" className="space-y-3">
              <h2 id="left-title" className="px-1 text-heading">
                Left to spend
              </h2>
              <div className="card p-5 sm:p-6">
                <LeftToSpendBar safe={money} f={f} />
              </div>
            </section>
          </div>

          {current && <PaydayNote periodStart={span.start} foldId="plan-note" />}
          <div className="space-y-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0">
            <EnvelopesSection
              envelopes={model.envelopes}
              usage={money.envelopes}
              period={span}
              today={today}
            />
            <SavingsSummary today={today} />
          </div>
          {data && (
            <InsightsSection
              data={data}
              range={span as DateRange}
              past={span.end <= today}
              foldId="plan-insights"
            />
          )}
        </div>
      )}
    </>
  )
}

const NO_RUNWAY = {
  perDay: 0,
  leftToday: 0,
  spentToday: 0,
  startOfDaySafe: 0,
  daysLeft: 1,
  onTrack: true,
}

/** Money in · Bills · Spent · Safe to spend (or "Left over" once the period is done). */
function PlanStrip({
  safe,
  current,
  future,
}: {
  safe: SafeToSpend
  current: boolean
  future: boolean
}) {
  const f = useFormat()
  const short = safe.status === 'short'
  return (
    <StatStrip
      label="This period at a glance"
      items={[
        {
          label: 'Money in',
          value: f.money(safe.income + safe.carriedIn),
          hint:
            safe.carriedIn !== 0
              ? `${f.money(safe.carriedIn)} ${safe.isStartPeriod ? 'starting balance' : 'carried over'}`
              : 'Paydays and income',
        },
        {
          label: 'Bills',
          value: f.money(safe.bills),
          hint: `${f.money(safe.billsPaid)} paid · ${f.money(safe.billsPending)} to pay`,
        },
        {
          label: 'Spent',
          value: f.money(safe.expenses),
          hint: 'Logged spending, net of refunds',
        },
        {
          label:
            current || future
              ? short
                ? 'Short'
                : 'Safe to spend'
              : short
                ? 'Ran short'
                : 'Left over',
          value: f.money(Math.abs(safe.total)),
          hint:
            safe.buffer > 0
              ? `After a ${f.money(safe.buffer)} cushion`
              : 'Money in − bills − spent',
        },
      ]}
    />
  )
}

/** Every line of the formula with what's inside it, plus the walled-off savings and debt. */
function PeriodCard({ safe, title }: { safe: SafeToSpend; title: string }) {
  const f = useFormat()
  return (
    <section aria-labelledby="period-title" className="card p-5">
      <h2 id="period-title" className="text-heading">
        {title}
      </h2>
      {safe.beforeTracking && (
        <p className="mt-1 text-sm text-muted">Before you started tracking: actuals only.</p>
      )}
      <dl className="mt-4 divide-y divide-line text-body">
        {safe.lines.map((line) => (
          <Row key={line.id} label={line.label} value={f.money(line.amount)}>
            {line.items && line.items.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-sm text-muted">
                {line.items.slice(0, 8).map((item, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span className="truncate">
                      {item.label}
                      {item.date && ` · ${f.day(item.date)}`}
                      {line.id === 'bills' && (item.done ? ' · paid' : ' · to pay')}
                    </span>
                    <span className="shrink-0 tabular-nums">{f.money(item.amount)}</span>
                  </li>
                ))}
                {line.items.length > 8 && <li>and {line.items.length - 8} more</li>}
              </ul>
            )}
          </Row>
        ))}
        <Row
          label={safe.status === 'short' ? 'Short' : 'Safe to spend'}
          value={f.money(safe.total)}
          strong
        />
      </dl>
      <p className="mt-3 rounded-2xl bg-bg px-4 py-3 text-sm text-muted">
        Saved {f.money(safe.savingsMoved)} · debt paid {f.money(safe.debtPaid)}. Tracked on their
        own; they never change safe to spend.
      </p>
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
