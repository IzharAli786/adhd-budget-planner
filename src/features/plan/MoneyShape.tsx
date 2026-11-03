import type { SafeToSpend } from '../../domain/safeToSpend'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { Formatters } from '../bills/format'

const BILLS = 'var(--env-rose)'
const SPENT = 'var(--env-amber)'
const CUSHION = 'var(--env-slate)'
const SAFE = 'var(--env-sage)'

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
 * "Spending distribution": where the money went so far this period, by envelope (bills
 * outside any envelope get their own slice). Savings and debt payments are not spending,
 * so they are not in it. The list beside it carries every number; the ring is decoration.
 */
export function SpendingDonut({ safe, f }: { safe: SafeToSpend; f: Formatters }) {
  const rows = safe.distribution
  const total = rows.reduce((a, r) => a + r.amount, 0)
  if (total <= 0) return <p className="text-body text-muted">Nothing spent yet this period.</p>
  const pct = percents(rows.map((r) => r.amount))
  const R = 52
  const C = 2 * Math.PI * R
  const lens = rows.map((r) => (r.amount / total) * C)
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0))
  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start lg:flex-col lg:items-stretch 2xl:flex-row">
      <svg
        viewBox="0 0 140 140"
        aria-hidden="true"
        className="mx-auto h-40 w-40 shrink-0 -rotate-90 sm:mx-0"
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
              strokeWidth="20"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-starts[i]!}
            />
          )
        })}
      </svg>
      <ul aria-label="Spending distribution" className="min-w-0 flex-1 divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 py-2">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: colorOf(r) }}
            />
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {f.money(r.amount)} · {pct[i]}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * "Left to spend": money in for the period, split into bills, spending, cushion and what is
 * still safe to spend. The segments add up to money in exactly, like the formula. Savings
 * and debt payments are shown beside it, never inside it: they don't change the number.
 */
export function LeftToSpendBar({ safe, f }: { safe: SafeToSpend; f: Formatters }) {
  const moneyIn = Math.max(0, safe.income + safe.carriedIn)
  const spent = Math.max(0, safe.expenses)
  const short = safe.total < 0
  const parts = [
    { key: 'bills', label: 'Bills', amount: safe.bills, color: BILLS },
    { key: 'spent', label: 'Spent', amount: spent, color: SPENT },
    { key: 'cushion', label: 'Cushion', amount: safe.buffer, color: CUSHION },
    { key: 'safe', label: 'Safe to spend', amount: Math.max(0, safe.total), color: SAFE },
  ].filter((p) => p.amount > 0)
  const whole = Math.max(1, short ? parts.reduce((a, p) => a + p.amount, 0) : moneyIn)
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[2rem] leading-tight font-semibold tabular-nums">
          {f.money(Math.abs(safe.total))}
        </span>
        <span className="text-body text-muted">{short ? 'short' : 'safe to spend'}</span>
      </p>
      <p className="text-sm text-muted">of {f.money(moneyIn)} in</p>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${f.money(p.amount)}`).join(', ')}
        className="mt-4 flex h-6 overflow-hidden rounded-full bg-line"
      >
        {parts.map((p) => (
          <div
            key={p.key}
            style={{ width: `${(p.amount / whole) * 100}%`, backgroundColor: p.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
        {parts.map((p) => (
          <li key={p.key} className="inline-flex items-center gap-1.5 tabular-nums">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
            {p.label} {f.money(p.amount)}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4 text-sm">
        <span className="rounded-full bg-bg px-3 py-1 ring-1 ring-line tabular-nums">
          Saved {f.money(safe.savingsMoved)}
        </span>
        <span className="rounded-full bg-bg px-3 py-1 ring-1 ring-line tabular-nums">
          Debt paid {f.money(safe.debtPaid)}
        </span>
        <span className="basis-full text-caption text-muted">
          Tracked on their own. They never lower safe to spend.
        </span>
      </div>
    </div>
  )
}
