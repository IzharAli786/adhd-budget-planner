import type { SafeToSpend } from '../../domain/safeToSpend'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { Formatters } from '../bills/format'

const BILLS = 'var(--env-rose)'
const SPENT = 'var(--env-amber)'
const IN = 'var(--env-sage)'
const ENVELOPES = 'var(--env-amber)'
const DEBT = 'var(--env-rose)'
const SAVINGS = 'var(--env-ocean)'
const SAFE_LINE = 'var(--env-sage)'
const SAFE_FILL = 'color-mix(in oklab, var(--env-sage) 16%, var(--surface))'
const tint = (color: string, pct = 16) => `color-mix(in oklab, ${color} ${pct}%, var(--surface))`

const colorOf = (d: { id: string; color?: string }) =>
  d.id === 'bills' ? BILLS : d.id === 'spending' ? SPENT : envelopeColor(d.color)

/** Whole-number percentages that add up to exactly 100 (largest remainder). */
function percents(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i]! += 1
    left -= 1
  }
  return out
}

/**
 * "Income vs spending": what came in this period against what went out (bills plus
 * spending), as two bars on the same scale. Savings and debt payments are neither.
 */
export function IncomeVsSpending({ safe, f }: { safe: SafeToSpend; f: Formatters }) {
  const moneyIn = Math.max(0, safe.income)
  const spent = Math.max(0, safe.expenses)
  const moneyOut = safe.bills + spent
  const scale = Math.max(1, moneyIn, moneyOut)
  const diff = moneyIn - moneyOut
  const rows = [
    {
      key: 'in',
      label: 'Money in',
      amount: moneyIn,
      color: IN,
      hint: 'Paydays and other income',
    },
    {
      key: 'out',
      label: 'Money out',
      amount: moneyOut,
      color: SPENT,
      hint: `Bills ${f.money(safe.bills)} · spending ${f.money(spent)}`,
    },
  ]
  return (
    <div>
      <ul className="space-y-5">
        {rows.map((r) => (
          <li key={r.key}>
            <p className="flex flex-wrap items-baseline justify-between gap-x-4">
              <span className="text-body font-medium">{r.label}</span>
              <span className="type-display text-heading">{f.money(r.amount)}</span>
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-4 overflow-hidden rounded-full"
              style={{ backgroundColor: tint(r.color) }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(r.amount / scale) * 100}%`,
                  minWidth: r.amount > 0 ? '0.5rem' : 0,
                  backgroundColor: r.color,
                }}
              />
            </div>
            <p className="mt-1.5 text-caption text-muted tabular-nums">{r.hint}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-line pt-4 text-body">
        {moneyIn === 0 && moneyOut === 0 ? (
          <span className="text-muted">Nothing in or out yet.</span>
        ) : diff >= 0 ? (
          <>
            <span className="font-semibold tabular-nums">{f.money(diff)}</span> more came in than
            went out.
          </>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{f.money(-diff)}</span> more went out than
            came in.
          </>
        )}
        {safe.carriedIn !== 0 && (
          <span className="block text-caption text-muted tabular-nums">
            {safe.isStartPeriod ? 'Starting balance' : 'Carried over'}: {f.money(safe.carriedIn)},
            counted on its own.
          </span>
        )}
      </p>
    </div>
  )
}

/**
 * "Spending distribution": where the money went so far this period, by envelope (bills
 * outside any envelope get their own slice), in the envelopes' own order. Savings and debt
 * payments are not spending, so they are not in it. The list carries every number; the
 * ring is decoration.
 */
export function SpendingDonut({ safe, f }: { safe: SafeToSpend; f: Formatters }) {
  const order = new Map(safe.envelopes.map((e, i) => [e.id, i]))
  const rank = (id: string) => order.get(id) ?? order.size
  const rows = [...safe.distribution].sort((a, b) => rank(a.id) - rank(b.id))
  const total = rows.reduce((a, r) => a + r.amount, 0)
  if (total <= 0) return <p className="text-body text-muted">Nothing spent yet.</p>
  const pct = percents(rows.map((r) => r.amount))
  const R = 52
  const C = 2 * Math.PI * R
  const lens = rows.map((r) => (r.amount / total) * C)
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <div>
      <svg
        viewBox="0 0 140 140"
        aria-hidden="true"
        className="h-44 w-44 shrink-0 -rotate-90 sm:h-52 sm:w-52"
      >
        {rows.map((r, i) => {
          const len = lens[i]!
          return (
            <circle
              key={r.id}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={colorOf(r)}
              strokeWidth="22"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-starts[i]!}
            />
          )
        })}
      </svg>
      <ul aria-label="Spending distribution" className="mt-6 divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 py-3">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-[3px]"
              style={{ backgroundColor: colorOf(r) }}
            />
            <span className="min-w-0 flex-1 truncate text-body">{r.name}</span>
            <span className="shrink-0 font-display text-body font-semibold">
              {f.money(r.amount)} · {pct[i]}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * "Left to spend": the period's money as one bar. Envelopes (bills and spending), debt
 * paid, money saved, then what is still safe to spend; each part's width is its share of
 * their sum. The words and the "See the math" sheet carry the numbers.
 */
export function LeftToSpendBar({
  safe,
  f,
  past = false,
  onSeeMath,
}: {
  safe: SafeToSpend
  f: Formatters
  /** A period that has ended: "left over" rather than "safe to spend". */
  past?: boolean
  onSeeMath?: () => void
}) {
  const short = safe.total < 0
  const safeLabel = past ? 'Left over' : 'Safe to spend'
  const parts = [
    {
      key: 'envelopes',
      label: 'Envelopes',
      amount: Math.max(0, safe.bills + Math.max(0, safe.expenses)),
      color: ENVELOPES,
    },
    { key: 'debt', label: 'Debt', amount: Math.max(0, safe.debtPaid), color: DEBT },
    { key: 'savings', label: 'Savings', amount: Math.max(0, safe.savingsMoved), color: SAVINGS },
    { key: 'safe', label: safeLabel, amount: Math.max(0, safe.total), color: SAFE_FILL },
  ]
  const whole = parts.reduce((a, p) => a + p.amount, 0)
  const shown = parts.filter((p) => p.amount > 0)
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2.5">
        <span
          className="type-display text-[2.25rem] leading-tight tabular-nums"
          style={short ? undefined : { color: SAFE_LINE }}
        >
          {f.money(Math.abs(safe.total))}
        </span>
        <span className="text-[1.0625rem]">
          {short ? (past ? 'ran short' : 'short') : past ? 'left over' : 'safe to spend'}
        </span>
      </p>
      <div
        role="img"
        aria-label={
          whole > 0
            ? parts.map((p) => `${p.label} ${f.money(p.amount)}`).join(', ')
            : 'Nothing in or out yet'
        }
        className="mt-4 flex h-8 overflow-hidden rounded-full"
        style={{ backgroundColor: SAFE_FILL }}
      >
        {whole > 0 &&
          shown.map((p) => (
            <div
              key={p.key}
              className={p.key === 'safe' ? 'border-l-2 border-dashed' : undefined}
              style={{
                width: `${(p.amount / whole) * 100}%`,
                backgroundColor: p.color,
                borderColor: p.key === 'safe' ? SAFE_LINE : undefined,
              }}
            />
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={
                p.key === 'safe'
                  ? 'h-3 w-3 rounded-[3px] border-[1.5px] border-dashed'
                  : 'h-3 w-3 rounded-[3px]'
              }
              style={
                p.key === 'safe'
                  ? { borderColor: SAFE_LINE, backgroundColor: SAFE_FILL }
                  : { backgroundColor: p.color }
              }
            />
            {p.label}
          </li>
        ))}
      </ul>
      {onSeeMath && (
        <button
          type="button"
          onClick={onSeeMath}
          className="-mx-2 mt-2 min-h-11 rounded-full px-2 text-sm font-medium text-accent hover:bg-accent-soft/60"
        >
          See the math
        </button>
      )}
    </div>
  )
}
