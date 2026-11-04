import { lazy, Suspense, useId, useMemo, useState } from 'react'
import { addMonths } from '../../domain/dates'
import {
  compare,
  defaultBudget,
  monthlyInterest,
  negativeAmortization,
  sumMinimums,
  totalsOverTime,
  type SimulationOk,
  type Strategy,
} from '../../domain/debt'
import type { Cents } from '../../domain/money'
import type { Debt, ISODate } from '../../domain/types'
import { cx } from '../../ui/cx'
import { Icon } from '../../ui/Icon'
import { MoneyInput } from '../../ui/MoneyInput'
import { Notice } from '../../ui/Notice'
import { Segmented } from '../../ui/Segmented'
import { StatusBadge, TAG } from '../../ui/status'
import { useFormat, type Formatters } from '../bills/format'
import type { OwedDebt } from './useDebtsOwed'

const PayoffChart = lazy(() => import('./PayoffChart'))

const STRATEGY_INFO: Record<Strategy, { title: string; blurb: string }> = {
  snowball: { title: 'Snowball', blurb: 'Smallest balance first. Quick wins.' },
  avalanche: { title: 'Avalanche', blurb: 'Highest interest first. Usually less interest.' },
}
const STRATEGY_OPTIONS = [
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'snowball', label: 'Snowball' },
] as const

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Snowball vs avalanche for a monthly budget (PLAN §4.3), with the order and a chart. The
 * simulation starts from what is owed today, so payments since a balance was entered count.
 */
export function PayoffPlan({ debts: owedDebts, today }: { debts: OwedDebt[]; today: ISODate }) {
  const f = useFormat()
  const debts = useMemo<Debt[]>(
    () => owedDebts.map(({ owed, ...d }) => ({ ...d, balance: owed })),
    [owedDebts],
  )
  const sliderId = useId()
  const minimums = sumMinimums(debts)
  // €50 (or 50 of any currency) on top of the minimums: noticeable, but doable.
  const suggested = defaultBudget(debts, 50 * 10 ** f.decimals)
  const [chosen, setChosen] = useState<Cents | null>(null)
  // Remounts the typed field when the slider moves, so the two never disagree.
  const [inputRev, setInputRev] = useState(0)
  const [strategy, setStrategy] = useState<Strategy>('avalanche')
  const budget = chosen ?? suggested

  const result = useMemo(() => compare(debts, budget), [debts, budget])
  const stuck = negativeAmortization(debts)
  const unit = 10 ** f.decimals
  const sliderMax = Math.max(minimums * 3, minimums + 1000 * unit)

  return (
    <section aria-labelledby={`${sliderId}-title`} className="card space-y-6 p-5 sm:p-6">
      <header>
        <h3 id={`${sliderId}-title`} className="section-title">
          Your payoff plan
        </h3>
        <p className="mt-0.5 text-body text-muted">
          Two ways to use the same monthly amount. Minimums first, the rest to one debt.
        </p>
      </header>

      <div className="space-y-3">
        <MoneyInput
          key={inputRev}
          label="Each month toward debts"
          value={budget}
          onChange={(v) => setChosen(v)}
          symbol={f.symbol}
          decimals={f.decimals}
          hint={`Minimums add up to ${f.money(minimums)}.`}
        />
        <input
          id={sliderId}
          type="range"
          aria-label="Each month toward debts"
          aria-valuetext={f.money(budget)}
          min={minimums}
          max={sliderMax}
          step={unit}
          value={Math.min(Math.max(budget, minimums), sliderMax)}
          onChange={(e) => {
            setChosen(Number(e.target.value))
            setInputRev((n) => n + 1)
          }}
          className="h-11 w-full accent-[var(--accent)]"
        />
      </div>

      {'error' in result ? (
        <Notice tone="attention" role="status">
          To cover every minimum this needs at least{' '}
          <span className="font-semibold tabular-nums">{f.money(result.minimums)}</span> a month.
        </Notice>
      ) : (
        <Comparison
          snowball={result.snowball}
          avalanche={result.avalanche}
          interestSaved={result.interestSaved}
          monthsDiff={result.monthsDiff}
          today={today}
          f={f}
          strategy={strategy}
          onStrategy={setStrategy}
          debts={debts}
        />
      )}

      {stuck.length > 0 && (
        <Notice tone="info">
          <div className="space-y-1">
            {stuck.map((d) => (
              <p key={d.id}>
                <span className="font-medium">{d.name}</span>’s minimum doesn’t cover its interest
                (about{' '}
                <span className="tabular-nums">
                  {f.money(monthlyInterest(d.balance, d.aprBps))}
                </span>{' '}
                a month), so paying only the minimum won’t shrink it.
              </p>
            ))}
          </div>
        </Notice>
      )}

      <div className="space-y-1 text-sm text-muted">
        <p>Estimate. Real lenders may calculate interest differently.</p>
        <p>Not financial advice. All numbers are estimates based on what you enter.</p>
      </div>
    </section>
  )
}

interface ComparisonProps {
  snowball: SimulationOk
  avalanche: SimulationOk
  interestSaved: Cents
  monthsDiff: number
  today: ISODate
  f: Formatters
  strategy: Strategy
  onStrategy: (s: Strategy) => void
  debts: Debt[]
}

function Comparison(p: ComparisonProps) {
  const { f, today } = p
  const sims = { snowball: p.snowball, avalanche: p.avalanche }
  const picked = sims[p.strategy]
  const orderId = useId()
  const names = new Map(p.debts.map((d) => [d.id, d.name]))
  // Still-owing debts that never finish in time are listed after the ones that do.
  const unfinished = picked.paidOff
    ? []
    : p.debts.filter((d) => d.balance > 0 && !picked.payoffOrder.some((o) => o.id === d.id))

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {(['snowball', 'avalanche'] as const).map((s) => (
          <StrategyCard
            key={s}
            strategy={s}
            sim={sims[s]}
            today={today}
            f={f}
            selected={s === p.strategy}
          />
        ))}
      </div>

      <p className="text-body" aria-live="polite">
        {p.snowball.paidOff && p.avalanche.paidOff
          ? summary(p.interestSaved, p.monthsDiff, f)
          : 'At this amount there’s no finish date within 50 years. A higher monthly amount shows one.'}
      </p>

      <div className="space-y-3">
        <h4 id={orderId} className="text-sm font-medium">
          Payoff order
        </h4>
        <Segmented
          label="Payoff order for"
          value={p.strategy}
          options={STRATEGY_OPTIONS}
          onChange={p.onStrategy}
        />
        <ol aria-labelledby={orderId} className="divide-y divide-line">
          {picked.payoffOrder.map((o, i) => (
            <li key={o.id} className="flex min-h-12 items-center gap-3 py-2">
              <OrderNumber n={i + 1} />
              <OrderName name={names.get(o.id)} focus={o.id === picked.focus} />
              <span className="shrink-0 text-sm text-muted tabular-nums">
                {f.month(addMonths(today, o.month))}
              </span>
            </li>
          ))}
          {unfinished.map((d, i) => (
            <li key={d.id} className="flex min-h-12 items-center gap-3 py-2">
              <OrderNumber n={picked.payoffOrder.length + i + 1} />
              <OrderName name={d.name} focus={d.id === picked.focus} />
              <span className="shrink-0 text-sm text-muted">Over 50 years</span>
            </li>
          ))}
        </ol>
      </div>

      <Suspense
        fallback={<div aria-hidden="true" className="h-44 animate-pulse rounded-2xl bg-bg" />}
      >
        <PayoffChart
          snowball={totalsOverTime(p.snowball)}
          avalanche={totalsOverTime(p.avalanche)}
          today={today}
          f={f}
        />
      </Suspense>
    </>
  )
}

function OrderNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-medium text-muted tabular-nums"
    >
      {n}
    </span>
  )
}

// "Focus first" marks where the money above the minimums goes now (sim.focus), which is
// not always the debt that finishes first. On a narrow row the badge drops under the
// name, so the name is never cut short ("Credit c…").
function OrderName({ name, focus }: { name: string | undefined; focus: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0 font-medium break-words">{name}</span>
      {focus && <StatusBadge status={TAG.focusFirst} />}
    </span>
  )
}

function StrategyCard({
  strategy,
  sim,
  today,
  f,
  selected,
}: {
  strategy: Strategy
  sim: SimulationOk
  today: ISODate
  f: Formatters
  selected: boolean
}) {
  const info = STRATEGY_INFO[strategy]
  // The ring follows the order being shown below, so neither plan looks like "the answer".
  return (
    <div
      className={cx(
        'relative rounded-3xl bg-bg p-4 transition-shadow',
        selected ? 'ring-2 ring-accent' : 'ring-1 ring-line',
      )}
    >
      {selected && (
        <Icon name="check" size={16} weight="bold" className="absolute top-4 right-4 text-accent" />
      )}
      <h4 className="pr-6 font-semibold">{info.title}</h4>
      <p className="text-sm text-muted">{info.blurb}</p>
      <dl className="mt-3 space-y-2">
        <div>
          <dt className="text-xs text-muted">Debt-free</dt>
          <dd className="font-semibold tabular-nums">
            {sim.paidOff ? f.month(addMonths(today, sim.months)) : 'Not in sight yet'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Months</dt>
          <dd className="tabular-nums">{sim.paidOff ? sim.months : 'Over 600'}</dd>
        </div>
        <div>
          {/* Not Look back's "Interest paid this year": this is what is still to come. */}
          <dt className="text-xs text-muted">Interest until debt-free (estimate)</dt>
          {/* Unfinished, the total is just wherever the 50-year window stopped: not a real figure. */}
          <dd className="tabular-nums">
            {sim.paidOff ? f.money(sim.totalInterest) : 'Still adding up'}
          </dd>
        </div>
      </dl>
    </div>
  )
}

function summary(saved: Cents, monthsDiff: number, f: Formatters): string {
  const sooner = monthsDiff > 0 ? `, and you’re done ${plural(monthsDiff, 'month')} sooner` : ''
  if (saved > 0) return `Avalanche saves ${f.money(saved)} in interest${sooner}.`
  if (saved < 0) return `Here snowball costs ${f.money(-saved)} less in interest.`
  if (monthsDiff !== 0)
    return `Same interest either way; ${monthsDiff > 0 ? 'avalanche' : 'snowball'} finishes ${plural(Math.abs(monthsDiff), 'month')} sooner.`
  return 'Both plans cost the same here. Pick the one that keeps you going.'
}
