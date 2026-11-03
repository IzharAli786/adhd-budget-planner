// The "shape of your money" glances on Today: saved and still owed, the period's safe to
// spend, debt minimums, goals in progress and in motion. Every number is derived from the
// same rows as the rest of the app; nothing is stored twice.
import { useMemo } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { useDebts, useLifeGoals } from '../../db/hooks'
import { setLifeGoalStatus } from '../../db/repos'
import { billEntriesBetween } from '../../domain/bills'
import { parseISODate } from '../../domain/dates'
import { debtOwed } from '../../domain/debt'
import { dateTimeFormat } from '../../domain/intl'
import { fundSaved } from '../../domain/savings'
import type { ISODate, LifeGoalStatus } from '../../domain/types'
import { cx } from '../../ui/cx'
import { useFormat, type Formatters } from '../bills/format'
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

/** "Nov 5" (or "05/11" with the numbers date style): a date with no weekday, for lists. */
export function useShortDay() {
  const { locale, dateStyle } = useAppSettings().settings
  return useMemo(() => {
    const fmt = dateTimeFormat(locale, {
      timeZone: 'UTC',
      ...(dateStyle === 'numbers'
        ? { day: '2-digit', month: '2-digit' }
        : { day: 'numeric', month: 'short' }),
    })
    return (date: ISODate) => {
      const { year, month, day } = parseISODate(date)
      return fmt.format(new Date(Date.UTC(year, month - 1, day)))
    }
  }, [locale, dateStyle])
}

/**
 * A big amount with its cents set smaller and quieter ("€9,000" + ".00"), so the eye reads
 * the whole units first. Screen readers get the plain amount in one piece.
 */
export function SplitMoney({ text, decimals }: { text: string; decimals: number }) {
  const m =
    decimals > 0
      ? new RegExp(`^(.*\\p{Nd})([.,\\u066B](?:\\p{Nd}){${decimals}})(\\D*)$`, 'u').exec(text)
      : null
  if (!m) return <>{text}</>
  return (
    <>
      <span aria-hidden="true">
        {m[1]}
        <span className="text-[0.56em] font-medium tracking-normal text-muted">{m[2]}</span>
        {m[3]}
      </span>
      <span className="sr-only">{text}</span>
    </>
  )
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

// Sized by the card (cqi), so a long amount shrinks before it can overflow a phone.
const HERO_AMOUNT =
  'relative mt-2 font-display text-[clamp(2rem,12cqi,3.5rem)] leading-none font-semibold tracking-tight whitespace-nowrap'

/** Saved across every fund (left) · Still owed (right). Stacks on phones. */
export function MoneyOverview({ model }: { model: TodayModel }) {
  const f = useFormat()
  const t = useTotals(model)
  if (!t) return <div aria-hidden="true" className="card-hero h-48 animate-pulse" />
  return (
    <section
      aria-label="Savings and debt"
      className="card-hero @container flex flex-col gap-8 px-6 py-7 sm:flex-row sm:items-start sm:justify-between sm:px-8 sm:py-9"
    >
      <div className="min-w-0">
        <p className="text-body font-medium text-muted sm:text-base">Saved across every fund</p>
        <p className={HERO_AMOUNT}>
          <SplitMoney text={f.money(t.saved)} decimals={f.decimals} />
        </p>
        <p className="mt-3 text-body text-muted">
          {t.funds === 0
            ? 'No savings funds yet. Start one whenever you like.'
            : `across ${plural(t.funds, 'fund')}${t.target > 0 ? `, toward ${f.money(t.target)}` : ''}`}
        </p>
      </div>
      <div className="min-w-0 sm:text-right">
        <p className="text-body font-medium text-muted sm:text-base">Still owed</p>
        <p className={HERO_AMOUNT}>
          <SplitMoney text={f.money(t.owed)} decimals={f.decimals} />
        </p>
        <p className="mt-3 text-body text-muted">
          {t.debts === 0 ? 'Nothing owed right now.' : `across ${plural(t.debts, 'debt')}`}
        </p>
      </div>
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
  // A short period reads "short by €…", never a minus sign.
  const short = plan.safe.status === 'short'
  return (
    <ul aria-label="At a glance" className="grid gap-4 sm:grid-cols-3 sm:gap-5">
      <Tile
        tone="sage"
        label={`${name} ${short ? 'short by' : 'safe to spend'}`}
        value={f.money(Math.abs(plan.safe.total))}
      />
      <Tile label="Debt minimums due monthly" value={f.money(t.minimums)} />
      <Tile label="Goals in progress" value={String(inProgress)} />
    </ul>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'sage' }) {
  return (
    <li
      className={cx(
        'rounded-3xl px-6 py-5',
        tone === 'sage'
          ? 'bg-[color-mix(in_oklab,var(--env-sage)_13%,var(--surface))]'
          : 'bg-[color-mix(in_oklab,var(--accent-soft)_75%,var(--surface))]',
      )}
    >
      {/* On the green tint, muted grey falls below AA contrast in dark mode: full text. */}
      <p className={cx('text-sm font-medium', tone === 'sage' ? 'text-text' : 'text-muted')}>
        {label}
      </p>
      <p className="mt-1.5 font-display text-[2rem] leading-tight font-semibold tracking-tight sm:text-[2.25rem]">
        {value}
      </p>
    </li>
  )
}

const STATUS_LABEL: Record<LifeGoalStatus, string> = {
  todo: 'Not started',
  doing: 'In progress',
  done: 'Done',
}
const NEXT_STATUS: Record<LifeGoalStatus, LifeGoalStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}
// "In progress" is a warm amber tint; its text is pulled toward the body colour so it
// passes AA on the tint in both modes. "Not started" stays neutral.
const PILL: Record<LifeGoalStatus, string> = {
  todo: 'bg-bg text-muted ring-1 ring-line',
  doing:
    'bg-[color-mix(in_oklab,var(--env-amber)_18%,var(--surface))] text-[color-mix(in_oklab,var(--env-amber)_76%,var(--text))]',
  done: 'bg-[color-mix(in_oklab,var(--env-sage)_16%,var(--surface))] text-text',
}

/** Goals that aren't done yet, in progress first. Tap a pill to move it along. */
export function GoalsInMotion() {
  const shortDay = useShortDay()
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
    <section aria-labelledby="goals-motion" className="space-y-4">
      <Header id="goals-motion" title="Goals in motion" to="/goals" cta="Open goals" />
      {open.length === 0 ? (
        <p className="card-quiet px-6 py-5 text-body text-muted">
          Nothing on the go yet. What’s one thing this money is for?{' '}
          <Link to="/goals" className="font-medium text-accent">
            Add a goal
          </Link>
        </p>
      ) : (
        <ul className="card divide-y divide-line px-5 py-3 sm:px-7 sm:py-5">
          {open.map((g) => (
            <li key={g.id} className="flex min-h-14 items-center gap-3 py-1 sm:gap-4">
              <button
                type="button"
                onClick={async () => {
                  const next = NEXT_STATUS[g.status]
                  await setLifeGoalStatus(g.id, next)
                  undoToast(`${g.title}: ${STATUS_LABEL[next].toLowerCase()}`)
                }}
                aria-label={`${g.title}: ${STATUS_LABEL[g.status]}. Change status`}
                className="group -my-1 inline-flex min-h-11 shrink-0 items-center rounded-full"
              >
                <span
                  className={cx(
                    'inline-flex min-h-8 items-center rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-[filter] group-hover:brightness-95',
                    PILL[g.status],
                  )}
                >
                  {STATUS_LABEL[g.status]}
                </span>
              </button>
              <span className="relative min-w-0 flex-1 truncate text-base">{g.title}</span>
              {g.targetDate && (
                <span className="shrink-0 text-sm font-medium text-muted tabular-nums">
                  {shortDay(g.targetDate)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** A section title in the display face, with one outlined pill link on the right. */
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
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="type-display text-[1.5rem] leading-tight sm:text-[1.625rem]">
        {title}
      </h2>
      <Link
        to={to}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-surface px-5 text-sm font-semibold whitespace-nowrap shadow-card ring-1 ring-line transition-colors hover:bg-accent-soft"
      >
        {cta}
      </Link>
    </div>
  )
}
