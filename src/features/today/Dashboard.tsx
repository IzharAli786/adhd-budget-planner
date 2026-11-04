// The "shape of your money" glances on Today: saved and still owed, the period's safe to
// spend, debt minimums, goals in progress and in motion. Every number is derived from the
// same rows as the rest of the app; nothing is stored twice.
//
// Layout follows the Today wrapper's width (@container/today), not the viewport: below
// md the app column is phone-narrow even on a wide window, so a viewport breakpoint would
// put two hero columns and three tiles into 400px.
import { useEffect, useMemo, useRef, type Ref } from 'react'
import { Link } from 'react-router'
import { useAppSettings } from '../../app/SettingsProvider'
import { useUndoToast } from '../../app/useUndoToast'
import { setLifeGoalStatus } from '../../db/repos'
import { parseISODate } from '../../domain/dates'
import { dateTimeFormat } from '../../domain/intl'
import { fundSaved } from '../../domain/savings'
import type { ISODate, LifeGoal, LifeGoalStatus } from '../../domain/types'
import { cx } from '../../ui/cx'
import { useFormat } from '../bills/format'
import { useDebtsOwed } from '../debts/useDebtsOwed'
import type { TodayModel } from './useTodayModel'

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

export interface Totals {
  saved: number
  target: number
  funds: number
  owed: number
  debts: number
  /** Monthly minimums of the debts still owing. */
  minimums: number
}

/**
 * Saved and owed for the hero and tiles, worked out once for the whole screen. Owed comes
 * from useDebtsOwed, the same numbers the Debt screen and Goals show. Undefined while loading.
 */
export function useTotals(model: TodayModel): Totals | undefined {
  const owedDebts = useDebtsOwed()
  return useMemo(() => {
    if (!owedDebts) return undefined
    const funds = model.funds
    const owing = owedDebts.filter((d) => d.owed > 0)
    return {
      saved: funds.reduce((a, fund) => a + fundSaved(fund, model.transactions), 0),
      target: funds.reduce((a, fund) => a + (fund.target ?? 0), 0),
      funds: funds.length,
      owed: owing.reduce((a, d) => a + d.owed, 0),
      debts: owing.length,
      minimums: owing.reduce((a, d) => a + d.minPayment, 0),
    }
  }, [owedDebts, model.funds, model.transactions])
}

/**
 * A big amount with its cents set smaller and quieter ("€9,000" + ".00"), so the eye reads
 * the whole units first. One copy of the text: it reads and copies as "€9,000.00".
 */
function SplitMoney({ text, decimals }: { text: string; decimals: number }) {
  const m =
    decimals > 0
      ? new RegExp(`^(.*\\p{Nd})([.,\\u066B](?:\\p{Nd}){${decimals}})(\\D*)$`, 'u').exec(text)
      : null
  if (!m) return <>{text}</>
  return (
    <>
      {m[1]}
      <span className="text-[0.56em] font-medium tracking-normal text-muted">{m[2]}</span>
      {m[3]}
    </>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Sized by the hero card (cqi), so a long amount shrinks before it can overflow: the whole
// card width when stacked, about half of it side by side.
const HERO_AMOUNT =
  'mt-1.5 font-display text-[clamp(2rem,12cqi,3.125rem)] leading-none font-semibold tracking-tight whitespace-nowrap @xl/today:text-[clamp(1.75rem,6cqi,3.125rem)]'

/**
 * Saved across every fund (left) · Still owed (pushed right, its lines sharing one left
 * edge). Stacks when the column is narrow. While loading, the same layout holds the space.
 */
export function MoneyOverview({ totals }: { totals: Totals | undefined }) {
  const f = useFormat()
  const t = totals ?? { saved: 0, target: 0, funds: 1, owed: 0, debts: 1, minimums: 0 }
  return (
    <section
      aria-label={totals ? 'Savings and debt' : undefined}
      aria-hidden={totals ? undefined : true}
      className={cx(
        'card-hero @container flex flex-col gap-7 px-6 py-6',
        '@xl/today:flex-row @xl/today:items-start @xl/today:justify-between @xl/today:gap-8 @xl/today:px-8 @xl/today:py-7',
        !totals && 'animate-pulse',
      )}
    >
      <div className={cx('min-w-0', !totals && 'invisible')}>
        <p className="text-body font-medium text-muted">Saved across every fund</p>
        <p className={HERO_AMOUNT}>
          <SplitMoney text={f.money(t.saved)} decimals={f.decimals} />
        </p>
        <p className="mt-2.5 text-sm text-muted">
          {t.funds === 0
            ? 'No savings funds yet. Start one whenever you like.'
            : `across ${plural(t.funds, 'fund')}${t.target > 0 ? `, toward ${f.money(t.target)}` : ''}`}
        </p>
      </div>
      <div className={cx('min-w-0 shrink-0', !totals && 'invisible')}>
        <p className="text-body font-medium text-muted">Still owed</p>
        <p className={HERO_AMOUNT}>
          <SplitMoney text={f.money(t.owed)} decimals={f.decimals} />
        </p>
        <p className="mt-2.5 text-sm text-muted">
          {t.debts === 0 ? 'Nothing owed right now.' : `across ${plural(t.debts, 'debt')}`}
        </p>
      </div>
    </section>
  )
}

/** The period's name for labels: "November", or "This pay period". */
function usePeriodName(start: ISODate) {
  const f = useFormat()
  const { planBy } = useAppSettings().settings
  return planBy === 'month' ? f.monthName(start) : 'This pay period'
}

type ReadyPlan = Extract<NonNullable<TodayModel['plan']>, { kind: 'ready' }>

/**
 * {Month} safe to spend · Debt minimums due monthly · Goals in progress. Three across when
 * the column has room, stacked on phones. While loading, the same tiles hold the space.
 */
export function GlanceTiles({
  plan,
  totals,
  goals,
}: {
  plan: ReadyPlan
  totals: Totals | undefined
  goals: readonly LifeGoal[] | undefined
}) {
  const f = useFormat()
  const name = usePeriodName(plan.period.start)
  const loading = !totals || !goals
  // A short period reads "short by €…", never a minus sign.
  const short = plan.safe.status === 'short'
  return (
    <ul
      aria-label={loading ? undefined : 'At a glance'}
      aria-hidden={loading ? true : undefined}
      className={cx('grid gap-4 @xl/today:grid-cols-3', loading && 'animate-pulse')}
    >
      <Tile
        tone="sage"
        label={`${name} ${short ? 'short by' : 'safe to spend'}`}
        value={f.money(Math.abs(plan.safe.total))}
        hidden={loading}
      />
      <Tile
        label="Debt minimums due monthly"
        value={f.money(totals?.minimums ?? 0)}
        hidden={loading}
      />
      <Tile
        label="Goals in progress"
        value={String((goals ?? []).filter((g) => g.status === 'doing').length)}
        hidden={loading}
      />
    </ul>
  )
}

// The first tile's label is muted like the others, tinted toward the tile's green and
// pulled a little toward the text colour: at least 5.4:1 on the green tile in every theme,
// light and dark (plain muted grey dips under 4.5:1 there in dark mode).
const SAGE_LABEL =
  'text-[color-mix(in_oklab,color-mix(in_oklab,var(--env-sage)_35%,var(--muted))_85%,var(--text))]'

function Tile({
  label,
  value,
  tone,
  hidden,
}: {
  label: string
  value: string
  tone?: 'sage'
  hidden: boolean
}) {
  return (
    <li
      className={cx(
        // Each tile is a container, so its number shrinks with the tile (cqi) and never clips.
        '@container rounded-3xl px-5 py-4 @4xl/today:px-6',
        tone === 'sage'
          ? 'bg-[color-mix(in_oklab,var(--env-sage)_13%,var(--surface))]'
          : 'bg-[color-mix(in_oklab,var(--accent-soft)_75%,var(--surface))]',
      )}
    >
      <div className={cx(hidden && 'invisible')}>
        <p className={cx('text-caption font-medium', tone === 'sage' ? SAGE_LABEL : 'text-muted')}>
          {label}
        </p>
        <p className="mt-1 font-display text-[clamp(1.25rem,16cqi,2rem)] leading-tight font-semibold tracking-tight whitespace-nowrap">
          {value}
        </p>
      </div>
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
const SHOW_GOALS = 4

/** Goals that aren't done yet, in progress first. Tap a pill to move it along. */
export function GoalsInMotion({ goals }: { goals: readonly LifeGoal[] | undefined }) {
  const shortDay = useShortDay()
  const undoToast = useUndoToast()
  const pills = useRef(new Map<string, HTMLButtonElement>())
  const heading = useRef<HTMLHeadingElement>(null)
  // Where keyboard focus goes once a status change lands: a goal's pill, or '' for the
  // heading. Kept until that element exists (a goal further down can slide into view).
  const focusTo = useRef<string | null>(null)
  const settleFocus = () => {
    const id = focusTo.current
    if (id === null) return
    const el = id ? pills.current.get(id) : heading.current
    if (el) {
      el.focus()
      focusTo.current = null
    }
  }
  useEffect(settleFocus)

  const open = useMemo(
    () =>
      (goals ?? [])
        .filter((g) => g.status !== 'done')
        .sort(
          (a, b) =>
            (a.status === 'doing' ? 0 : 1) - (b.status === 'doing' ? 0 : 1) ||
            (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'),
        ),
    [goals],
  )
  if (!goals) return null

  async function cycle(goal: LifeGoal, index: number, button: HTMLButtonElement) {
    const next = NEXT_STATUS[goal.status]
    const hadFocus = document.activeElement === button
    await setLifeGoalStatus(goal.id, next)
    undoToast(`${goal.title}: ${STATUS_LABEL[next].toLowerCase()}`)
    if (!hadFocus) return
    // A done goal leaves the list: focus the next goal's pill, else the one before it,
    // else the heading. Otherwise the pill stays focused as its row moves up.
    focusTo.current = next === 'done' ? (open[index + 1]?.id ?? open[index - 1]?.id ?? '') : goal.id
    settleFocus()
  }

  return (
    <section aria-labelledby="goals-motion" className="space-y-3">
      <Header
        id="goals-motion"
        title="Goals in motion"
        to="/goals"
        cta="Open goals"
        headingRef={heading}
      />
      {open.length === 0 ? (
        <p className="card-quiet px-6 py-5 text-body text-muted">
          Nothing on the go yet. What’s one thing this money is for?{' '}
          <Link to="/goals" className="font-medium text-accent">
            Add a goal
          </Link>
        </p>
      ) : (
        <ul className="card divide-y divide-line px-5 py-2 @xl/today:px-6 @xl/today:py-5">
          {open.slice(0, SHOW_GOALS).map((g, i) => (
            <li key={g.id} className="flex min-h-11 items-center gap-3 @xl/today:gap-4">
              {/* The pill is small to look at; the button around it is the 44px target. */}
              <button
                type="button"
                ref={(el) => {
                  if (el) pills.current.set(g.id, el)
                  else pills.current.delete(g.id)
                }}
                onClick={(e) => void cycle(g, i, e.currentTarget)}
                aria-label={`${g.title}: ${STATUS_LABEL[g.status]}. Change status`}
                className="group inline-flex min-h-11 shrink-0 items-center rounded-full"
              >
                <span
                  className={cx(
                    'inline-flex min-h-7 items-center rounded-full px-3 text-xs font-semibold whitespace-nowrap transition-[filter] group-hover:brightness-95',
                    PILL[g.status],
                  )}
                >
                  {STATUS_LABEL[g.status]}
                </span>
              </button>
              <span className="min-w-0 flex-1 truncate text-body">{g.title}</span>
              {g.targetDate && (
                // Set in from the edge where there's room: a date to note, not an amount.
                <span className="shrink-0 text-caption font-medium text-muted tabular-nums @xl/today:pr-6">
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

/**
 * A section title in the display face, with one outlined pill link on the right. The pill
 * is slim to look at; a taller invisible band around it keeps the 44px tap target.
 */
export function Header({
  id,
  title,
  to,
  cta,
  headingRef,
}: {
  id: string
  title: string
  to: string
  cta: string
  /** Lets a section send focus to its heading (tabIndex -1) when its list empties. */
  headingRef?: Ref<HTMLHeadingElement>
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2
        id={id}
        ref={headingRef}
        tabIndex={headingRef ? -1 : undefined}
        className="type-display text-[1.25rem] leading-tight @xl/today:text-[1.375rem]"
      >
        {title}
      </h2>
      <Link
        to={to}
        className="relative inline-flex h-[2.125rem] shrink-0 items-center rounded-full bg-surface px-3.5 text-caption font-semibold whitespace-nowrap shadow-card ring-1 ring-line transition-colors before:absolute before:inset-x-0 before:-inset-y-[0.3125rem] before:content-[''] hover:bg-accent-soft"
      >
        {cta}
      </Link>
    </div>
  )
}
