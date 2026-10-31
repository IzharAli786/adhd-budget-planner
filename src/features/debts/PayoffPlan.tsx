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
import { Segmented } from '../../ui/Segmented'
import { useFormat, type Formatters } from '../bills/format'

const PayoffChart = lazy(() => import('./PayoffChart'))

const STRATEGY_INFO: Record<Strategy, { title: string; blurb: string }> = {
  snowball: { title: 'Snowball', blurb: 'Smallest balance first. Quick wins.' },
  avalanche: { title: 'Avalanche', blurb: 'Highest interest first. Costs least.' },
}
const STRATEGY_OPTIONS = [
  { value: 'avalanche', label: 'Avalanche' },
  { value: 'snowball', label: 'Snowball' },
] as const

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Snowball vs avalanche for a monthly budget (PLAN §4.3), with the order and a chart. */
export function PayoffPlan({ debts, today }: { debts: Debt[]; today: ISODate }) {
  const f = useFormat()
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
    <section
      aria-labelledby={`${sliderId}-title`}
      className="space-y-6 rounded-[1.75rem] bg-surface p-5 shadow-card ring-1 ring-line sm:p-6"
    >
      <header>
        <h3 id={`${sliderId}-title`} className="text-lg font-semibold">
          Your payoff plan
        </h3>
        <p className="mt-0.5 text-[0.9375rem] text-muted">
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
        <p role="status" className="rounded-2xl bg-danger-soft px-4 py-3 text-[0.9375rem]">
          To cover every minimum this needs at least{' '}
          <span className="font-semibold tabular-nums">{f.money(result.minimums)}</span> a month.
        </p>
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
        <div className="flex gap-3 rounded-2xl bg-accent-soft/70 px-4 py-3 text-[0.9375rem]">
          <Icon name="info" size={20} className="mt-0.5 shrink-0 text-accent" />
          <div className="space-y-1">
            {stuck.map((d) => (
              <p key={d.id}>
                <span className="font-medium">{d.name}</span>’s minimum doesn’t cover its interest
                (about{' '}
                <span className="tabular-nums">
                  {f.money(monthlyInterest(d.balance, d.aprBps))}
                </span>{' '}
                a month), so the minimum alone won’t shrink it. Anything extra helps.
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="text-sm text-muted">
        Estimate. Real lenders may calculate interest differently.
      </p>
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

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {(['snowball', 'avalanche'] as const).map((s) => (
          <StrategyCard key={s} strategy={s} sim={sims[s]} today={today} f={f} />
        ))}
      </div>

      <p className="text-[0.9375rem]" aria-live="polite">
        {summary(p.interestSaved, p.monthsDiff, f)}
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
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-medium text-muted tabular-nums"
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{names.get(o.id)}</span>
              {i === 0 && (
                <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-contrast">
                  Focus first
                </span>
              )}
              <span className="text-sm text-muted tabular-nums">
                {f.month(addMonths(today, o.month))}
              </span>
            </li>
          ))}
        </ol>
        {!picked.paidOff && (
          <p className="text-sm text-muted">
            The rest wouldn’t be paid off within 50 years at this amount.
          </p>
        )}
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

function StrategyCard({
  strategy,
  sim,
  today,
  f,
}: {
  strategy: Strategy
  sim: SimulationOk
  today: ISODate
  f: Formatters
}) {
  const info = STRATEGY_INFO[strategy]
  return (
    <div
      className={cx('rounded-3xl bg-bg p-4', strategy === 'avalanche' && 'ring-1 ring-accent/30')}
    >
      <h4 className="font-semibold">{info.title}</h4>
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
          <dd className="tabular-nums">{sim.paidOff ? sim.months : '600+'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Total interest</dt>
          <dd className="tabular-nums">{f.money(sim.totalInterest)}</dd>
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
  return 'Both cost the same here. Pick the one that keeps you going.'
}
