// The "shape of your money" glances on Today (PLAN-v2 item 1): saved and still owed, the
// period's safe to spend, debt minimums, goals in progress and in motion, and budget vs
// actual. Every number is derived from the same rows as the hero; nothing is stored twice.
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { useDebts, useLifeGoals } from '../../db/hooks'
import { setLifeGoalStatus } from '../../db/repos'
import { billEntriesBetween } from '../../domain/bills'
import { debtOwed } from '../../domain/debt'
import { fundSaved } from '../../domain/savings'
import type { LifeGoalStatus } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { useFormat, type Formatters } from '../bills/format'
import { STATUS_LABEL } from '../goals/LifeGoals'
import { BudgetChart } from '../plan/BudgetChart'
import type { TodayModel } from './useTodayModel'

/** "November" from "November 2026", in the app's locale. */
export const monthName = (f: Formatters, date: string) =>
  f
    .month(date)
    .replace(/\s*\d{4}\s*/, ' ')
    .trim()

/** The period's name for labels: "November", or "This pay period". */
export function usePeriodName(start: string) {
  const f = useFormat()
  const { planBy } = useAppSettings().settings
  return planBy === 'month' ? monthName(f, start) : 'This pay period'
}

function useTotals(model: TodayModel) {
  const debts = useDebts()
  return useMemo(() => {
    if (!debts) return null
    const funds = model.funds
    const saved = funds.reduce((a, fund) => a + fundSaved(fund, model.transactions), 0)
    const target = funds.reduce((a, fund) => a + (fund.target ?? 0), 0)
    const earliest = debts.reduce((d, x) => (x.balanceAsOf < d ? x.balanceAsOf : d), '9999-12-31')
    const minimums = billEntriesBetween(
      model.bills.filter((b) => b.debtId !== undefined),
      model.occurrences,
      earliest,
      addYears(earliest, 5),
    )
    const owedRows = debts.map((d) => ({ d, owed: debtOwed(d, model.transactions, minimums) }))
    const open = owedRows.filter((r) => r.owed > 0)
    return {
      saved,
      target,
      funds: funds.length,
      owed: open.reduce((a, r) => a + r.owed, 0),
      debts: open.length,
      minimums: open.reduce((a, r) => a + r.d.minPayment, 0),
    }
  }, [debts, model.funds, model.transactions, model.bills, model.occurrences])
}

// Minimums ticked paid since the earliest balance; five years ahead covers any of them.
const addYears = (d: string, n: number) =>
  d.startsWith('9999') ? d : `${Number(d.slice(0, 4)) + n}${d.slice(4, 8)}01`

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Saved across every fund · Still owed. */
export function MoneyOverview({ model }: { model: TodayModel }) {
  const f = useFormat()
  const t = useTotals(model)
  if (!t) return null
  return (
    <section aria-label="Savings and debt" className="card grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
      <Link
        to="/goals"
        className="group min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <p className="text-body text-muted">Saved across every fund</p>
        <p className="mt-1 font-display text-[2rem] leading-tight font-semibold tabular-nums">
          {f.money(t.saved)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t.funds === 0
            ? 'No funds yet. Start one in Goals.'
            : `across ${plural(t.funds, 'fund')}${t.target > 0 ? `, toward ${f.money(t.target)}` : ''}`}
        </p>
      </Link>
      <Link
        to="/more/debts"
        className="min-w-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent sm:text-right"
      >
        <p className="text-body text-muted">Still owed</p>
        <p className="mt-1 font-display text-[2rem] leading-tight font-semibold tabular-nums">
          {f.money(t.owed)}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t.debts === 0 ? 'Nothing owed. Lovely.' : `across ${plural(t.debts, 'debt')}`}
        </p>
      </Link>
    </section>
  )
}

/** {Month} safe to spend · Debt minimums due monthly · Goals in progress. */
export function GlanceTiles({ model }: { model: TodayModel }) {
  const f = useFormat()
  const t = useTotals(model)
  const goals = useLifeGoals()
  const plan = model.plan?.kind === 'ready' ? model.plan : null
  const name = usePeriodName(plan?.period.start ?? '2000-01-01')
  if (!plan || !t) return null
  const inProgress = (goals ?? []).filter((g) => g.status === 'doing').length
  const short = plan.safe.status === 'short'
  return (
    <ul aria-label="At a glance" className="grid gap-3 sm:grid-cols-3">
      <Tile
        tone="sage"
        label={`${name} ${short ? 'short by' : 'safe to spend'}`}
        value={f.money(Math.abs(plan.safe.total))}
        hint={`${f.money(plan.safe.billsPending)} of bills still to pay`}
      />
      <Tile
        label="Debt minimums due monthly"
        value={f.money(t.minimums)}
        hint={t.debts === 0 ? 'No debts listed' : `Across ${plural(t.debts, 'debt')}`}
        to="/more/debts"
      />
      <Tile
        label="Goals in progress"
        value={String(inProgress)}
        hint={plural((goals ?? []).filter((g) => g.status !== 'done').length, 'open goal')}
        to="/goals"
      />
    </ul>
  )
}

function Tile({
  label,
  value,
  hint,
  tone,
  to,
}: {
  label: string
  value: string
  hint: string
  tone?: 'sage'
  to?: string
}) {
  // On the green tint, muted grey falls below AA contrast in dark mode (axe): full text.
  const soft = tone === 'sage' ? 'text-text' : 'text-muted'
  const body = (
    <>
      <p className={cx('text-sm font-medium', soft)}>{label}</p>
      <p className="mt-1 font-display text-[1.75rem] leading-tight font-semibold tabular-nums">
        {value}
      </p>
      <p className={cx('mt-0.5 text-caption', soft)}>{hint}</p>
    </>
  )
  const cls = cx(
    'block h-full rounded-3xl p-4 sm:p-5',
    tone === 'sage'
      ? 'bg-[color-mix(in_oklab,var(--env-sage)_14%,var(--surface))] ring-1 ring-line'
      : 'bg-accent-soft/60 ring-1 ring-line',
  )
  return (
    <li>
      {to ? (
        <Link
          to={to}
          className={cx(
            cls,
            'outline-none hover:bg-accent-soft focus-visible:ring-2 focus-visible:ring-accent',
          )}
        >
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}

const NEXT_STATUS: Record<LifeGoalStatus, LifeGoalStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}
const PILL: Record<LifeGoalStatus, string> = {
  todo: 'bg-bg text-muted ring-1 ring-line',
  doing: 'bg-accent-soft text-accent',
  done: 'bg-(--env-sage) text-surface',
}

/** Goals that aren't done yet, in progress first. Tap a pill to move it along. */
export function GoalsInMotion() {
  const f = useFormat()
  const goals = useLifeGoals()
  const undoToast = useUndoToast()
  if (!goals) return null
  const open = goals
    .filter((g) => g.status !== 'done')
    .sort(
      (a, b) =>
        (a.status === 'doing' ? 0 : 1) - (b.status === 'doing' ? 0 : 1) ||
        (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'),
    )
    .slice(0, 4)
  return (
    <section aria-labelledby="goals-motion" className="space-y-3">
      <Header id="goals-motion" title="Goals in motion" to="/goals" cta="Open goals" />
      {open.length === 0 ? (
        <p className="card-quiet p-5 text-body text-muted">
          Nothing in motion. What’s one thing this money is for?{' '}
          <Link to="/goals" className="font-medium text-accent">
            Add a goal
          </Link>
        </p>
      ) : (
        <ul className="card divide-y divide-line px-2">
          {open.map((g) => (
            <li key={g.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
              <button
                type="button"
                onClick={async () => {
                  const next = NEXT_STATUS[g.status]
                  await setLifeGoalStatus(g.id, next)
                  undoToast(`${g.title}: ${STATUS_LABEL[next].toLowerCase()}`)
                }}
                aria-label={`${g.title}: ${STATUS_LABEL[g.status]}. Change status`}
                className={cx(
                  'inline-flex min-h-9 shrink-0 items-center rounded-full px-3 text-caption font-semibold',
                  PILL[g.status],
                )}
              >
                {STATUS_LABEL[g.status]}
              </button>
              <span className="min-w-0 flex-1 truncate font-medium">{g.title}</span>
              {g.targetDate && (
                <span className="shrink-0 text-sm text-muted tabular-nums">
                  {f.day(g.targetDate)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Budget vs actual on the home screen; the full chart and editing live on Plan. */
export function BudgetGlance({ model }: { model: TodayModel }) {
  const f = useFormat()
  const { settings } = useAppSettings()
  const plan = model.plan?.kind === 'ready' ? model.plan : null
  const name = usePeriodName(plan?.period.start ?? '2000-01-01')
  if (!plan || !settings.envelopesEnabled) return null
  const rows = plan.safe.envelopes
    .filter((e) => e.budget > 0 || e.spent + e.linkedDue > 0)
    .sort((a, b) => Math.max(b.budget, b.spent) - Math.max(a.budget, a.spent))
    .slice(0, 8)
  return (
    <section aria-labelledby="budget-glance" className="space-y-3">
      <Header id="budget-glance" title={`Budget vs actual · ${name}`} to="/plan" cta="Open plan" />
      {rows.length === 0 ? (
        <p className="card-quiet p-5 text-body text-muted">
          Give an envelope a budget on Plan, and planned vs actual shows up here as you spend.
        </p>
      ) : (
        <div className="card p-5">
          <BudgetChart rows={rows} f={f} compact label={`Budget vs actual, ${name}`} />
        </div>
      )}
    </section>
  )
}

export function Header({
  id,
  title,
  to,
  cta,
}: {
  id: string
  title: string
  to: string
  cta: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 id={id} className="text-heading">
        {title}
      </h2>
      <Link
        to={to}
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-4 text-sm font-semibold ring-1 ring-line hover:bg-accent-soft/60"
      >
        {cta}
        <Icon name="arrowRight" size={14} />
      </Link>
    </div>
  )
}
