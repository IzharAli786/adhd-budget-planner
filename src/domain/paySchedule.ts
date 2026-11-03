// Paydays and paycheck periods (PLAN §3.6). Order of operations matters:
//   nominal date (from the schedule) -> weekend shift -> PaydayOverride
// Overrides are keyed by the NOMINAL date so they survive a later weekend-rule change.
// An income's `from`/`until` (PLAN-v2 §2.1) limit the NOMINAL dates, inclusive.
import {
  addDays,
  addMonths,
  dayOfWeek,
  daysBetween,
  makeDate,
  maxDate,
  minDate,
  parseISODate,
  toDayNumber,
} from './dates'
import type { IncomeSource, ISODate, PaydayOverride, PaySchedule, WeekendRule } from './types'

export interface PayPeriod {
  start: ISODate // inclusive
  end: ISODate // exclusive: the next payday
  /** Days from today until the next payday (1 means "payday is tomorrow"). */
  daysLeft: number
}

export interface Payday {
  nominal: ISODate
  date: ISODate
  /** The date was moved by an override (an amount-only override doesn't count). */
  overridden: boolean
  /** The override row, when there is one: its amount and skipped flag apply. */
  override?: PaydayOverride
}

type ScheduleIncome = Pick<IncomeSource, 'id' | 'schedule' | 'weekendRule' | 'from' | 'until'>

// Furthest a nominal payday can be from its neighbour (a long month) plus a weekend shift.
const MAX_GAP_DAYS = 31 + 3

export function applyWeekendRule(date: ISODate, rule: WeekendRule): ISODate {
  if (rule === 'none') return date
  const dow = dayOfWeek(date)
  if (dow === 6) return addDays(date, rule === 'before' ? -1 : 2)
  if (dow === 0) return addDays(date, rule === 'before' ? -2 : 1)
  return date
}

const ceilDiv = (a: number, b: number) => -Math.floor(-a / b)

/** Nominal (unshifted) paydays in [from, to). */
export function nominalPaydays(schedule: PaySchedule, from: ISODate, to: ISODate): ISODate[] {
  if (from >= to) return []
  switch (schedule.kind) {
    case 'weekly':
    case 'biweekly': {
      // The anchor only fixes the phase; it can be in the future, so k may be negative.
      const step = schedule.kind === 'weekly' ? 7 : 14
      const out: ISODate[] = []
      let k = ceilDiv(daysBetween(schedule.anchor, from), step)
      for (
        let d = addDays(schedule.anchor, k * step);
        d < to;
        d = addDays(schedule.anchor, ++k * step)
      ) {
        out.push(d)
      }
      return out
    }
    case 'monthly':
    case 'semimonthly': {
      const days = schedule.kind === 'monthly' ? [schedule.day] : schedule.days
      const out = new Set<ISODate>()
      const { year, month } = parseISODate(from)
      for (let m = makeDate(year, month, 1); m < to; m = addMonths(m, 1)) {
        const p = parseISODate(m)
        for (const day of days) {
          const d = makeDate(p.year, p.month, day)
          if (d >= from && d < to) out.add(d)
        }
      }
      return [...out].sort()
    }
    case 'irregular':
      return [...new Set(schedule.expected.filter((d) => d >= from && d < to))].sort()
  }
}

/**
 * Effective paydays (shifted + overridden) whose final date falls in [from, to).
 * Two paychecks can land on the same date (semimonthly 1st + last with "after", or an
 * override onto another payday); both are kept because each one is a separate payment.
 */
export function paydaysBetween(
  income: ScheduleIncome,
  from: ISODate,
  to: ISODate,
  overrides: readonly PaydayOverride[] = [],
): Payday[] {
  const byNominal = new Map<ISODate, PaydayOverride>()
  let pad = 3
  for (const o of overrides) {
    if (o.incomeId !== income.id) continue
    byNominal.set(o.originalDate, o)
    if (o.date !== undefined)
      pad = Math.max(pad, Math.abs(daysBetween(o.originalDate, o.date)) + 3)
  }
  // Widen the nominal window so a date shifted or moved INTO [from, to) is not missed.
  const nominal = nominalPaydays(income.schedule, addDays(from, -pad), addDays(to, pad))
  const out: Payday[] = []
  for (const n of nominal) {
    if (income.from !== undefined && n < income.from) continue
    if (income.until !== undefined && n > income.until) continue
    const override = byNominal.get(n)
    const date = override?.date ?? applyWeekendRule(n, income.weekendRule)
    if (date < from || date >= to) continue
    out.push({
      nominal: n,
      date,
      overridden: override?.date !== undefined,
      ...(override ? { override } : {}),
    })
  }
  return out.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.nominal < b.nominal ? -1 : 1,
  )
}

// Search window for prev/next. Regular schedules never have gaps over MAX_GAP_DAYS,
// so a window of that size plus the largest override move always contains a hit.
function searchSpan(
  income: Pick<IncomeSource, 'id' | 'schedule'>,
  today: ISODate,
  overrides: readonly PaydayOverride[],
) {
  let span = MAX_GAP_DAYS
  for (const o of overrides) {
    if (o.incomeId === income.id && o.date !== undefined)
      span = Math.max(span, Math.abs(daysBetween(o.originalDate, o.date)) + MAX_GAP_DAYS)
  }
  if (income.schedule.kind === 'irregular') {
    for (const d of income.schedule.expected)
      span = Math.max(span, Math.abs(daysBetween(today, d)) + 3)
  }
  return span
}

/** First payday strictly after today, or null (irregular schedule with no future date). */
export function nextPayday(
  income: ScheduleIncome,
  today: ISODate,
  overrides: readonly PaydayOverride[] = [],
): ISODate | null {
  const span = searchSpan(income, today, overrides)
  return (
    paydaysBetween(income, addDays(today, 1), addDays(today, span + 1), overrides)[0]?.date ?? null
  )
}

/** Latest payday on or before today: the start of the current period. */
export function previousPayday(
  income: ScheduleIncome,
  today: ISODate,
  overrides: readonly PaydayOverride[] = [],
): ISODate | null {
  const span = searchSpan(income, today, overrides)
  return (
    paydaysBetween(income, addDays(today, -span), addDays(today, 1), overrides).at(-1)?.date ?? null
  )
}

/**
 * The paycheck period containing today: [previous payday, next payday).
 * Null when there is no known next payday, so the UI can ask "When is your next pay?".
 * With no past payday (first irregular payment still ahead) the period starts today.
 */
export function currentPeriod(
  income: ScheduleIncome,
  today: ISODate,
  overrides: readonly PaydayOverride[] = [],
): PayPeriod | null {
  const end = nextPayday(income, today, overrides)
  if (!end) return null
  const start = previousPayday(income, today, overrides) ?? today
  return { start, end, daysLeft: daysBetween(today, end) }
}

/** v4's rule, kept for the frozen v4 engine: the active primary, else the first active one. */
export function primaryIncome<T extends Pick<IncomeSource, 'primary' | 'active'>>(
  incomes: readonly T[],
): T | undefined {
  return incomes.find((i) => i.active && i.primary) ?? incomes.find((i) => i.active)
}

const covers = (i: Pick<IncomeSource, 'active' | 'from' | 'until'>, d: ISODate) =>
  i.active && (i.from === undefined || i.from <= d) && (i.until === undefined || d <= i.until)

/**
 * The income that is primary on a (nominal) date: the primary chain (PLAN-v2 §1.3, R16).
 * Among active primaries whose [from, until] covers the date, the one with the latest
 * `from` (an open start counts as the earliest); otherwise the first active income
 * covering it. A split leaves `primary` on both halves; their ranges don't overlap.
 */
export function primaryAt<T extends Pick<IncomeSource, 'primary' | 'active' | 'from' | 'until'>>(
  incomes: readonly T[],
  date: ISODate,
): T | undefined {
  let best: T | undefined
  for (const i of incomes) {
    if (!i.primary || !covers(i, date)) continue
    if (best === undefined || (i.from ?? '') > (best.from ?? '')) best = i
  }
  return best ?? incomes.find((i) => covers(i, date))
}

/** Fraction of the period already elapsed, 0..1, for progress rings. */
export function periodProgress(period: Pick<PayPeriod, 'start' | 'end'>, today: ISODate): number {
  const total = toDayNumber(period.end) - toDayNumber(period.start)
  if (total <= 0) return 1
  const done =
    toDayNumber(minDate(maxDate(today, period.start), period.end)) - toDayNumber(period.start)
  return done / total
}
