import { addDays } from '../../domain/dates'
import { previousPayday, primaryIncome } from '../../domain/paySchedule'
import type { DateSpan } from '../../domain/safeToSpend'
import { moneyStart, periodAt, type TodayInput } from '../../domain/today'
import type { ISODate } from '../../domain/types'

/**
 * The first day there is anything real to show: where tracking starts, or the oldest entry
 * logged before it. Periods that end before this day would only be projections from the
 * pay and bill schedules, so Home does not step back into them.
 */
export function firstTrackedDay(input: TodayInput, today: ISODate): ISODate {
  let first = moneyStart(input.money, input.checkIns ?? [], today).date
  for (const t of input.transactions)
    if (t.deletedAt === undefined && t.date < first) first = t.date
  return first
}

/**
 * periodAt(), but only a period that starts on a payday (any month does). Before an
 * irregular income's first payday periodAt() answers "from this very day", which would
 * let Previous walk back one day at a time.
 */
function paydayPeriodAt(input: TodayInput, date: ISODate): DateSpan | null {
  const span = periodAt(input, date)
  if (!span || input.money.planBy === 'month') return span
  const income = primaryIncome(input.incomes)
  return income && previousPayday(income, date, input.paydayOverrides) ? span : null
}

export interface PeriodNav {
  /** The period being looked at; null in pay-period mode when no payday frames it. */
  span: DateSpan | null
  /** The period before it, or null where there is no real one to go to. */
  prev: DateSpan | null
  next: DateSpan | null
}

/**
 * The period around `at` and its neighbours, worked out up front so an arrow can be
 * disabled instead of leading nowhere.
 *
 * - Previous is the period that ends where this one starts, if it holds anything tracked
 *   (see firstTrackedDay). Before the first payday the only one is the stretch from today
 *   to that payday, the one Home shows as "now".
 * - Next must start where this one ends; with no payday ahead there is none.
 */
export function periodNav(input: TodayInput, at: ISODate, today: ISODate): PeriodNav {
  const span = periodAt(input, at)
  if (!span) return { span, prev: null, next: null }
  let before = paydayPeriodAt(input, addDays(span.start, -1))
  if (!before && today < span.start) {
    const now = periodAt(input, today)
    if (now?.end === span.start) before = now
  }
  const first = firstTrackedDay(input, today)
  const prev =
    before && before.start < span.start && before.end <= span.start && before.end > first
      ? before
      : null
  const after = periodAt(input, span.end)
  const next = after && after.start >= span.end ? after : null
  return { span, prev, next }
}
