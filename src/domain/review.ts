// Look back (retrospective): money in and out per month or per pay period, and what was
// carried into each payday. Pure; the screen and the printed report pass the same rows.
//
// Steady never sees the bank, so this is rebuilt from what was entered: paydays on the
// schedule (only the ones already past), logged spending, bills marked paid, moves into
// savings and debt payments. Check-ins anchor the carry-over where there is one.
import { paydayEntriesBetween } from './bills'
import { addDays, makeDate, maxDate, minDate } from './dates'
import { isEverydaySpend, paidBillsIn, type DateRange } from './insights'
import type { Cents } from './money'
import { currentPeriod, paydaysBetween, primaryIncome } from './paySchedule'
import type {
  BalanceCheckIn,
  Bill,
  BillOccurrence,
  IncomeSource,
  Instant,
  ISODate,
  PaydayOverride,
  Transaction,
} from './types'

export interface ReviewInput {
  today: ISODate
  incomes: readonly IncomeSource[]
  paydayOverrides: readonly PaydayOverride[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  transactions: readonly Transaction[]
  checkIns: readonly Pick<BalanceCheckIn, 'at' | 'date' | 'balance'>[]
  /** Carry-overs saved at each payday moment (meta.periodClose). */
  periodClose?: PeriodCloseLog
  /** First day with history; paydays before it are not counted. Defaults to historyStart. */
  since?: ISODate
}

/** Saved at the payday moment, keyed by the payday, so Look back shows what was seen then. */
export interface PeriodClose {
  carried: Cents
  at: Instant
}
export type PeriodCloseLog = Record<ISODate, PeriodClose>

export interface Flows {
  /** Paydays already past, plus other money logged as coming in (refunds, gifts). */
  incomeIn: Cents
  /** Everyday spending logged. */
  spending: Cents
  /** Bills marked paid, debt minimums excluded (those are in debtPaid). */
  billsPaid: Cents
  /** Debt minimums marked paid, plus payments logged against a debt. */
  debtPaid: Cents
  /** spending + billsPaid + debtPaid. */
  moneyOut: Cents
  /** Net moves into savings (a withdrawal lowers it, so it can be negative). */
  saved: Cents
  /** incomeIn − moneyOut − saved: how much the spending account grew (or shrank). */
  net: Cents
}

export interface Carry {
  amount: Cents
  /** 'saved' at the payday moment, worked out from a 'check-in' in that period, or rolled
   *  forward through the logged 'flows' from an earlier check-in. */
  source: 'saved' | 'check-in' | 'flows'
}

export interface PeriodSummary extends Flows, DateRange {
  /** Per pay period only: money carried in at its payday, null when there is no balance
   *  to start from. Months have no carry-over. */
  carried?: Carry | null
}

export type ReviewMode = 'month' | 'payday'

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const within = (date: ISODate, r: DateRange) => date >= r.start && date < r.end

/**
 * The first day Steady knows about: the earliest check-in or logged entry (today if there
 * is none). A pay schedule has no start date, so without this an install from last week
 * would show a whole year of salary that was never tracked here.
 */
export function historyStart(input: Pick<ReviewInput, 'today' | 'transactions' | 'checkIns'>) {
  let first = input.today
  for (const c of input.checkIns) if (c.date < first) first = c.date
  for (const t of input.transactions)
    if (t.deletedAt === undefined && t.date < first) first = t.date
  return first
}

/**
 * Money in and out over [start, end). Paydays count from the start of the history up to
 * today: future ones haven't come, and ones before Steady was used were never tracked.
 */
export function flowsIn(input: ReviewInput, range: DateRange): Flows {
  const txs = input.transactions.filter((t) => t.deletedAt === undefined && within(t.date, range))
  const payStart = maxDate(range.start, input.since ?? historyStart(input))
  const payEnd = minDate(range.end, addDays(input.today, 1))
  const pay = sum(
    paydayEntriesBetween(input.incomes, input.paydayOverrides, payStart, payEnd).map(
      (p) => p.amount,
    ),
  )
  const everyday = txs.filter(isEverydaySpend)
  const otherIn = sum(everyday.filter((t) => t.amount > 0).map((t) => t.amount))
  const spending = 0 - sum(everyday.filter((t) => t.amount < 0).map((t) => t.amount))
  const paid = paidBillsIn(input.bills, input.occurrences, range)
  const billsPaid = sum(paid.filter((e) => e.debtId === undefined).map((e) => e.amount))
  const debtPaid =
    sum(paid.filter((e) => e.debtId !== undefined).map((e) => e.amount)) -
    sum(txs.filter((t) => t.debtId !== undefined && t.fundId === undefined).map((t) => t.amount))
  const saved = 0 - sum(txs.filter((t) => t.fundId !== undefined).map((t) => t.amount))
  const incomeIn = pay + otherIn
  const moneyOut = spending + billsPaid + debtPaid
  return {
    incomeIn,
    spending,
    billsPaid,
    debtPaid,
    moneyOut,
    saved,
    net: incomeIn - moneyOut - saved,
  }
}

export const yearRange = (year: number): DateRange => ({
  start: makeDate(year, 1, 1),
  end: makeDate(year + 1, 1, 1),
})

/** The twelve calendar months of a year. */
export function monthRanges(year: number): DateRange[] {
  return Array.from({ length: 12 }, (_, i) => ({
    start: makeDate(year, i + 1, 1),
    end: i === 11 ? makeDate(year + 1, 1, 1) : makeDate(year, i + 2, 1),
  }))
}

/**
 * Pay periods of the primary income that START in [from, to), each running to the next
 * payday. The last one may end after `to`: a period belongs where its payday falls.
 */
export function payPeriodRanges(
  input: Pick<ReviewInput, 'incomes' | 'paydayOverrides'>,
  span: DateRange,
): DateRange[] {
  const income = primaryIncome(input.incomes)
  if (!income) return []
  // Look a little past `to` so the last period knows where it ends.
  const dates = [
    ...new Set(
      paydaysBetween(income, span.start, addDays(span.end, 400), input.paydayOverrides).map(
        (p) => p.date,
      ),
    ),
  ]
  const out: DateRange[] = []
  for (let i = 0; i + 1 < dates.length && dates[i]! < span.end; i++)
    out.push({ start: dates[i]!, end: dates[i + 1]! })
  return out
}

/** The pay period before the one containing `date`, for "‹ previous period" on Plan. */
export function previousPayPeriod(
  input: Pick<ReviewInput, 'incomes' | 'paydayOverrides'>,
  periodStart: ISODate,
): DateRange | null {
  const income = primaryIncome(input.incomes)
  if (!income) return null
  const p = currentPeriod(income, addDays(periodStart, -1), input.paydayOverrides)
  return p && p.start < periodStart ? { start: p.start, end: p.end } : null
}

/**
 * What was in the account just before the pay landed on `payday`.
 * 1. The amount saved at that payday's moment, if there is one.
 * 2. Else the first check-in in that pay period, minus what came and went from the payday
 *    up to it (the pay included).
 * 3. Else the last check-in before the payday, plus what came and went since.
 * A check-in is taken to include everything dated on or before its day.
 */
export function carryOver(
  input: ReviewInput,
  payday: ISODate,
  periodEnd: ISODate | null = null,
): Carry | null {
  const saved = input.periodClose?.[payday]
  if (saved) return { amount: saved.carried, source: 'saved' }
  // Before the history starts there is no way to know what came in at that payday.
  if (payday < (input.since ?? historyStart(input))) return null
  const sorted = [...input.checkIns].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.at < b.at ? -1 : a.at > b.at ? 1 : 0,
  )
  const inPeriod = sorted.find(
    (c) => c.date >= payday && (periodEnd === null || c.date < periodEnd),
  )
  if (inPeriod) {
    const since = flowsIn(input, { start: payday, end: addDays(inPeriod.date, 1) })
    return { amount: inPeriod.balance - since.net, source: 'check-in' }
  }
  const before = sorted.filter((c) => c.date < payday).at(-1)
  if (before) {
    const since = flowsIn(input, { start: addDays(before.date, 1), end: payday })
    return { amount: before.balance + since.net, source: 'flows' }
  }
  return null
}

/**
 * One row per month, or per pay period, for a year (or any range). Only rows between the
 * start of the history and today: a review never invents the past or the future.
 */
export function periodSummaries(
  span: number | DateRange,
  mode: ReviewMode,
  input: ReviewInput,
): PeriodSummary[] {
  const range = typeof span === 'number' ? yearRange(span) : span
  const ranges =
    mode === 'month'
      ? typeof span === 'number'
        ? monthRanges(span)
        : monthsIn(range)
      : payPeriodRanges(input, range)
  const since = input.since ?? historyStart(input)
  return ranges
    .filter((r) => r.start <= input.today && r.end > since)
    .map((r) => ({
      ...r,
      ...flowsIn(input, r),
      ...(mode === 'payday' ? { carried: carryOver(input, r.start, r.end) } : {}),
    }))
}

function monthsIn(range: DateRange): DateRange[] {
  const out: DateRange[] = []
  const first = Number(range.start.slice(0, 4))
  const last = Number(range.end.slice(0, 4))
  for (let y = first; y <= last; y++)
    for (const m of monthRanges(y)) if (m.end > range.start && m.start < range.end) out.push(m)
  return out
}

/** Column totals for the year tiles and the table footer. */
export function totalFlows(rows: readonly Flows[]): Flows {
  const total = (k: keyof Flows) => sum(rows.map((r) => r[k]))
  return {
    incomeIn: total('incomeIn'),
    spending: total('spending'),
    billsPaid: total('billsPaid'),
    debtPaid: total('debtPaid'),
    moneyOut: total('moneyOut'),
    saved: total('saved'),
    net: total('net'),
  }
}

/** Years Look back can show: from the first thing entered up to this year. */
export function reviewYears(input: ReviewInput): number[] {
  const thisYear = Number(input.today.slice(0, 4))
  const dates = [
    ...input.transactions.map((t) => t.date),
    ...input.checkIns.map((c) => c.date),
    ...input.occurrences.filter((o) => o.status === 'paid').map((o) => o.movedTo ?? o.originalDate),
  ]
  const first = dates.reduce((y, d) => Math.min(y, Number(d.slice(0, 4))), thisYear)
  return Array.from({ length: thisYear - first + 1 }, (_, i) => first + i)
}
