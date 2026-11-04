import type { SafeToSpend } from '../../domain/safeToSpend'
import type { ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { DATA_COLOR, tint } from '../../ui/dataColors'
import { envelopeColor } from '../../ui/EnvelopeDot'
import { Icon } from '../../ui/Icon'
import type { Formatters } from '../bills/format'
import { percentLabel, percents } from '../home/percents'

// Data colours (ui/dataColors): the same kind of money is the same colour on every chart.
const BILLS = DATA_COLOR.bills
const SPENT = DATA_COLOR.spending
const IN = DATA_COLOR.in
/** Money out as one series (bills plus spending), as on the yearly review's In/Out chart. */
const OUT = DATA_COLOR.out
const ENVELOPES = DATA_COLOR.envelopes
const DEBT = DATA_COLOR.debt
const SAVINGS = DATA_COLOR.savings
const SAFE_LINE = DATA_COLOR.free
const SAFE_FILL = tint(SAFE_LINE)
/** The empty part of a track: neutral, so it never reads as one of the coloured parts. */
const TRACK = 'var(--track)'

const colorOf = (d: { id: string; color?: string }) =>
  d.id === 'bills' ? BILLS : d.id === 'spending' ? SPENT : envelopeColor(d.color)

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * "Income vs spending": money in this period against money out (bills plus spending), as
 * two bars on one scale. Savings and debt payments are neither.
 *
 * Until a period is over, part of it has not happened yet: pay that hasn't landed, bills
 * not yet due. That part is the lighter end of each bar, its amount is written under it,
 * and the sentence says "coming in" rather than "came in".
 */
export function IncomeVsSpending({
  safe,
  f,
  today,
  past = false,
  unit = 'month',
}: {
  safe: SafeToSpend
  f: Formatters
  today: ISODate
  /** The period has ended: everything in it has happened. */
  past?: boolean
  unit?: 'month' | 'pay period'
}) {
  const { flows } = safe
  const moneyIn = Math.max(0, safe.income)
  const spent = Math.max(0, safe.expenses)
  const moneyOut = safe.bills + spent
  // What has already happened, by date (a bill ticked paid early counts as gone out).
  const inSoFar =
    sum(flows.paydays.filter((p) => p.date <= today).map((p) => p.amount)) +
    sum(flows.loggedIncome.filter((t) => t.date <= today).map((t) => t.amount))
  const outSoFar =
    sum(
      flows.billEntries.filter((e) => e.status === 'paid' || e.date <= today).map((e) => e.amount),
    ) - sum(flows.spending.filter((t) => t.date <= today).map((t) => t.amount))
  const clamp = (soFar: number, whole: number) => Math.min(whole, Math.max(0, soFar))
  const scale = Math.max(1, moneyIn, moneyOut)
  const diff = moneyIn - moneyOut
  const rows = [
    {
      key: 'in',
      label: 'Money in',
      amount: moneyIn,
      done: past ? moneyIn : clamp(inSoFar, moneyIn),
      color: IN,
      hint: 'Paydays and other income',
    },
    {
      key: 'out',
      label: 'Money out',
      amount: moneyOut,
      done: past ? moneyOut : clamp(outSoFar, moneyOut),
      color: OUT,
      hint: `Bills ${f.money(safe.bills)} · spending ${f.money(spent)}`,
    },
  ]
  return (
    <div>
      <ul className="space-y-5">
        {rows.map((r) => {
          const toCome = r.amount - r.done
          return (
            <li key={r.key}>
              <p className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="text-body font-medium">{r.label}</span>
                <span className="type-display text-heading">{f.money(r.amount)}</span>
              </p>
              <div
                aria-hidden="true"
                className="mt-2 flex h-4 overflow-hidden rounded-full"
                style={{ backgroundColor: tint(r.color) }}
              >
                <div
                  className={cx('h-full', toCome > 0 ? 'rounded-l-full' : 'rounded-full')}
                  style={{
                    width: `${(r.done / scale) * 100}%`,
                    minWidth: r.done > 0 ? '0.5rem' : 0,
                    backgroundColor: r.color,
                  }}
                />
                {/* Still to come: a lighter body with a dashed edge in the series colour
                    (as "Still free" and the planned bars are drawn), so its edge is 3:1
                    against the track even when the whole bar is still to come. */}
                {toCome > 0 && (
                  <div
                    className={cx(
                      'h-full border-[1.5px] border-dashed',
                      r.done > 0 ? 'rounded-r-full border-l-0' : 'rounded-full',
                    )}
                    style={{
                      width: `${(toCome / scale) * 100}%`,
                      backgroundColor: tint(r.color, 35),
                      borderColor: r.color,
                    }}
                  />
                )}
              </div>
              <p className="mt-1.5 text-caption text-muted tabular-nums">
                {r.hint}
                {toCome > 0 && ` · ${f.money(toCome)} still to come`}
              </p>
            </li>
          )
        })}
      </ul>
      <p className="mt-5 border-t border-line pt-4 text-body">
        {moneyIn === 0 && moneyOut === 0 ? (
          <span className="text-muted">
            {past ? 'Nothing came in or went out.' : 'Nothing in or out yet.'}
          </span>
        ) : past ? (
          <>
            <span className="font-semibold tabular-nums">{f.money(Math.abs(diff))}</span>{' '}
            {diff >= 0 ? 'more came in than went out.' : 'more went out than came in.'}
          </>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{f.money(Math.abs(diff))}</span>{' '}
            {diff >= 0 ? 'more coming in than going out' : 'more going out than coming in'} by the
            end of the {unit}.
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
  const total = sum(rows.map((r) => r.amount))
  if (total <= 0) return <p className="text-body text-muted">Nothing spent yet.</p>
  const pct = percents(rows.map((r) => r.amount))
  const R = 52
  const C = 2 * Math.PI * R
  const lens = rows.map((r) => (r.amount / total) * C)
  const starts = lens.map((_, i) => sum(lens.slice(0, i)))
  return (
    <div>
      <svg
        viewBox="0 0 140 140"
        aria-hidden="true"
        className="h-44 w-44 shrink-0 -rotate-90 @xl:h-52 @xl:w-52"
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
            <span className="shrink-0 amount text-body">
              {f.money(r.amount)} · {percentLabel(r.amount, pct[i]!)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * "Left to spend": the period's money in as one bar, cut into where it went. Envelopes
 * (bills and spending), debt paid, money saved, then what is still free after those. The
 * whole bar is the money in (starting balance or carry-over plus income); if the parts come
 * to more than that, the bar is their sum instead.
 *
 * The big number is safe to spend, the same as Today's. Savings and debt never lower it
 * (they are kept apart on purpose), so "Still free" can be less than it: the bar shows
 * where the money actually is, the number what the plan lets you spend.
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
  const debt = Math.max(0, safe.debtPaid)
  const savings = Math.max(0, safe.savingsMoved)
  const parts = [
    {
      key: 'envelopes',
      label: 'Envelopes',
      amount: Math.max(0, safe.bills + Math.max(0, safe.expenses)),
      color: ENVELOPES,
    },
    { key: 'debt', label: 'Debt', amount: debt, color: DEBT },
    { key: 'savings', label: 'Savings', amount: savings, color: SAVINGS },
    {
      key: 'free',
      label: 'Still free',
      amount: Math.max(0, safe.total - debt - savings),
      color: SAFE_FILL,
    },
  ]
  const moneyIn = Math.max(0, safe.income + safe.carriedIn)
  const whole = Math.max(moneyIn, sum(parts.map((p) => p.amount)))
  const shown = parts.filter((p) => p.amount > 0)
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2.5">
        {/* A status, so a status tone: success when there is room, attention (and a glyph)
            when short. The word beside it says which, so colour is never the only cue. */}
        {short && (
          <Icon name="alert" size={20} className="shrink-0 self-center text-tone-attention" />
        )}
        <span
          className={cx(
            'type-display text-[2.25rem] leading-tight tabular-nums',
            short ? 'text-tone-attention' : 'text-tone-success',
          )}
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
            ? `${f.money(moneyIn)} in: ${parts.map((p) => `${p.label} ${f.money(p.amount)}`).join(', ')}`
            : 'Nothing in or out yet'
        }
        className="mt-4 flex h-8 overflow-hidden rounded-full"
        style={{ backgroundColor: TRACK }}
      >
        {whole > 0 &&
          shown.map((p, i) => (
            <div
              key={p.key}
              data-part={p.key}
              className={cx(
                i === 0 && 'rounded-l-full',
                i === shown.length - 1 && 'rounded-r-full',
                // The light part's edge has to show against the card, so it is outlined.
                p.key === 'free' && 'border-[1.5px] border-dashed',
              )}
              style={{
                width: `${(p.amount / whole) * 100}%`,
                backgroundColor: p.color,
                borderColor: p.key === 'free' ? SAFE_LINE : undefined,
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
                p.key === 'free'
                  ? 'h-3 w-3 rounded-[3px] border-[1.5px] border-dashed'
                  : 'h-3 w-3 rounded-[3px]'
              }
              style={
                p.key === 'free'
                  ? { borderColor: SAFE_LINE, backgroundColor: SAFE_FILL }
                  : { backgroundColor: p.color }
              }
            />
            {p.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-caption text-muted">
        Savings and debt show in the bar, but they never lower{' '}
        {past ? 'what’s left over' : 'safe to spend'}.
      </p>
      {onSeeMath && (
        <Button
          variant="text"
          size="sm"
          bleed
          iconEnd="chevron"
          onClick={onSeeMath}
          className="mt-2"
        >
          See the math
        </Button>
      )}
    </div>
  )
}
