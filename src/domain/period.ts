// Planning periods (PLAN-v2 §1.3). Every consumer takes its period from periodAt, so
// Today, Plan, the Calendar and Look back always agree on where a period starts.
//
// Month mode: calendar months. Payday mode: [primary payday, next primary payday), where
// "primary" follows the primary chain (paySchedule.primaryAt), so an income split keeps
// old periods on the old schedule and new ones on the new (R16). An override's date moves
// a boundary; a skipped or re-priced payday never does.
import { paydayEntriesBetween, type PaydayLine } from './bills'
import { addDays, addMonths, daysBetween, makeDate, parseISODate } from './dates'
import type { Cents } from './money'
import type { PlanBy } from './plan'
import type { DateRange, IncomeSource, ISODate, Note, PaydayOverride, PaySchedule } from './types'

export type { PlanBy }
export { primaryAt } from './paySchedule'

export interface Period {
  kind: PlanBy
  start: ISODate
  /** Exclusive. */
  end: ISODate
}

export interface PeriodContext {
  planBy: PlanBy
  incomes: readonly IncomeSource[]
  overrides: readonly PaydayOverride[]
}

/** Days from today to the end of the period, today included. Always at least 1. */
export const daysLeft = (p: Pick<Period, 'end'>, today: ISODate) =>
  Math.max(1, daysBetween(today, p.end))

export function monthOf(date: ISODate): Period {
  const { year, month } = parseISODate(date)
  const start = makeDate(year, month, 1)
  return { kind: 'month', start, end: addMonths(start, 1) }
}

/** Primary-chain paydays with an effective date in [from, to), skipped ones included. */
export function chainPaydays(
  ctx: Pick<PeriodContext, 'incomes' | 'overrides'>,
  from: ISODate,
  to: ISODate,
): PaydayLine[] {
  return paydayEntriesBetween(ctx.incomes, ctx.overrides, from, to).filter((p) => p.primary)
}

// Search outwards in growing windows: a chain can have a gap (one income ended, the next
// starts later) and irregular pay can be months apart. Two years is the give-up point.
const SPANS = [45, 120, 400, 800] as const

/** The latest chain payday dated on or before `date`. */
function boundaryAtOrBefore(ctx: PeriodContext, date: ISODate): ISODate | null {
  for (const span of SPANS) {
    const hit = chainPaydays(ctx, addDays(date, -span), addDays(date, 1)).at(-1)
    if (hit) return hit.date
  }
  return null
}

/** The first chain payday dated after `date`. */
function boundaryAfter(ctx: PeriodContext, date: ISODate): ISODate | null {
  for (const span of SPANS) {
    const hit = chainPaydays(ctx, addDays(date, 1), addDays(date, span + 1))[0]
    if (hit) return hit.date
  }
  return null
}

/**
 * The period containing `date`. Null only in payday mode with no next payday (Today then
 * asks "When is your next pay?"). With no payday before it (an irregular first payment
 * still ahead) the period starts on `date` itself, as v4 did.
 */
export function periodAt(date: ISODate, ctx: PeriodContext): Period | null {
  if (ctx.planBy === 'month') return monthOf(date)
  const end = boundaryAfter(ctx, date)
  if (end === null) return null
  return { kind: 'payday', start: boundaryAtOrBefore(ctx, date) ?? date, end }
}

export function previousPeriod(p: Period, ctx: PeriodContext): Period | null {
  const q = periodAt(addDays(p.start, -1), ctx)
  // Payday mode with nothing before p: periodAt falls back to a period ending at p.end.
  return q && q.end === p.start ? q : null
}

export function nextPeriod(p: Period, ctx: PeriodContext): Period | null {
  return periodAt(p.end, ctx)
}

/**
 * The periods that overlap [range.start, range.end), in order and with no gaps between
 * them. Payday mode stops early where no next payday is known.
 */
export function periodsIn(range: DateRange, ctx: PeriodContext): Period[] {
  const out: Period[] = []
  if (range.start >= range.end) return out
  let p = periodAt(range.start, ctx)
  while (p && p.start < range.end) {
    out.push(p)
    p = nextPeriod(p, ctx)
  }
  return out
}

/** Periods in a year: 12 for months; by schedule in payday mode; null for irregular pay. */
export function periodsPerYear(planBy: PlanBy, s?: PaySchedule): number | null {
  if (planBy === 'month') return 12
  switch (s?.kind) {
    case 'weekly':
      return 52
    case 'biweekly':
      return 26
    case 'semimonthly':
      return 24
    case 'monthly':
      return 12
    default:
      return null
  }
}

/**
 * A per-period budget for a different period length: €300 a fortnight (26 a year) is
 * €650 a month (12). Rounded to whole currency units (`unit` minor units), so a budget
 * never reads €649.99.
 */
export function scaleBudget(c: Cents, from: number, to: number, unit: Cents): Cents {
  if (from <= 0 || to <= 0 || unit <= 0) return c
  return Math.round((c * from) / to / unit) * unit
}

/**
 * The note for a period (§4.4, R24): the one whose periodStart falls in the period,
 * preferring the exact start. A note written in payday mode is still found in month mode.
 */
export function periodNoteFor<T extends Pick<Note, 'periodStart'>>(
  p: Pick<Period, 'start' | 'end'>,
  notes: readonly T[],
): T | undefined {
  const inside = notes.filter(
    (n) => n.periodStart !== undefined && n.periodStart >= p.start && n.periodStart < p.end,
  )
  return inside.find((n) => n.periodStart === p.start) ?? inside[0]
}
