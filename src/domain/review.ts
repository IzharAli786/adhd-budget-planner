// Look back (retrospective): money in and out per period, and what each period carried in
// and left over. Pure; the screen and the printed report pass the same rows.
//
// The rule (PLAN-v2 §3, R12): before the start of tracking, a CASH basis (what really
// moved: paid bills, past paydays, logged entries), because the plan didn't exist yet.
// From the start on, ACCRUAL, the same numbers as Today and Plan. The current period is
// "planned to <end>" with no leftover yet. Savings and debt never enter `net` (A2); they
// get their own columns.
import { effectiveStatus } from './bills'
import { addDays, makeDate, maxDate, minDate } from './dates'
import {
  accrualTotals,
  allDebtPayments,
  entriesBetween,
  paydaysBetweenDates,
  periodContext,
  planFor,
  transactionsBetween,
  txKind,
  type FlowTotals,
  type LedgerInput,
} from './ledger'
import type { Cents } from './money'
import { periodsIn, type Period } from './period'
import type { BalanceCheckIn, DateRange, ISODate } from './types'

export type CheckInLike = Pick<BalanceCheckIn, 'at' | 'date' | 'balance'>

export interface ReviewInput extends LedgerInput {
  /** v4's balance check-ins: read-only history (they only widen where history starts). */
  checkIns?: readonly CheckInLike[]
}

export interface PeriodTotals extends FlowTotals {
  /** income + corrections − bills − spending. */
  net: Cents
}

/** Kept apart from the totals above (A2). */
export interface KeptApart {
  /** Net moved into savings (a withdrawal lowers it). */
  saved: Cents
  /** Every debt payment: logged payments and paid minimums. */
  debtPaid: Cents
}

export interface PeriodRow extends PeriodTotals, KeptApart {
  period: Period
  /** 'cash' before tracking started, 'accrual' from the start on. */
  basis: 'cash' | 'accrual'
  /** Holds today: "planned to <end>", leftover null. */
  current: boolean
  /** Null before tracking. */
  carriedIn: Cents | null
  /** Null before tracking and for the current period. */
  leftover: Cents | null
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const within = (date: ISODate, r: DateRange) => date >= r.start && date < r.end

/**
 * The first day Steady knows about: the start of tracking, the first check-in or the first
 * logged entry, whichever is earliest (today when there is none). A pay schedule has no
 * start date, so without this an install from last week would show a year of salary.
 */
export function historyStart(input: ReviewInput): ISODate {
  let first = input.plan.startDate ?? input.today
  if (input.today < first) first = input.today
  for (const c of input.checkIns ?? []) if (c.date < first) first = c.date
  for (const t of input.transactions)
    if (t.deletedAt === undefined && t.date < first) first = t.date
  return first
}

/**
 * What really moved over a range, before tracking (R12): paydays already past, paid plain
 * bills by their date (entries dated before the bill was added are left out: they were
 * ticked during setup), logged income, spending and corrections.
 */
export function cashTotals(range: DateRange, input: ReviewInput): FlowTotals {
  const out: FlowTotals = { income: 0, corrections: 0, bills: 0, spending: 0 }
  const r = { start: maxDate(range.start, historyStart(input)), end: range.end }
  if (r.start >= r.end) return out
  const payEnd = minDate(r.end, addDays(input.today, 1))
  if (r.start < payEnd)
    for (const p of paydaysBetweenDates(input, r.start, payEnd)) if (!p.skipped) out.income += p.amount
  for (const t of transactionsBetween(input, r.start, r.end)) {
    const k = txKind(t)
    if (k === 'income') out.income += t.amount
    else if (k === 'adjustment') out.corrections += t.amount
    else if (k === 'expense' || k === 'refund') out.spending -= t.amount
  }
  for (const e of entriesBetween(input, r.start, r.end)) {
    if (e.debtId !== undefined || effectiveStatus(e, input.today) !== 'paid') continue
    const added = input.addedOn?.get(e.billId)
    if (added !== undefined && e.date < added) continue
    out.bills += e.amount
  }
  return out
}

/** Savings moves and debt payments dated in the range, up to today. */
export function keptApart(range: DateRange, input: ReviewInput): KeptApart {
  const r = { start: range.start, end: minDate(range.end, addDays(input.today, 1)) }
  if (r.start >= r.end) return { saved: 0, debtPaid: 0 }
  const saved = -sum(
    transactionsBetween(input, r.start, r.end)
      .filter((t) => t.fundId !== undefined)
      .map((t) => t.amount),
  )
  const debtPaid = sum(
    allDebtPayments(input)
      .filter((p) => within(p.date, r))
      .map((p) => p.amount),
  )
  return { saved, debtPaid }
}

const withNet = (t: FlowTotals): PeriodTotals => ({
  ...t,
  net: t.income + t.corrections - t.bills - t.spending,
})

/**
 * One row per period (month or pay period, per the plan setting) overlapping the range,
 * from the start of the history up to today: a review never invents the past or the
 * future. With roll over on, each row's leftover is the next row's carriedIn (I5).
 */
export function periodRows(range: DateRange, input: ReviewInput): PeriodRow[] {
  const since = historyStart(input)
  const start = input.plan.startDate
  return periodsIn(range, periodContext(input))
    .filter((p) => p.start <= input.today && p.end > since)
    .map((period): PeriodRow => {
      const current = within(input.today, period)
      const apart = keptApart(period, input)
      if (start === null || period.end <= start)
        return {
          period,
          basis: 'cash',
          current,
          ...withNet(cashTotals(period, input)),
          ...apart,
          carriedIn: null,
          leftover: null,
        }
      const plan = planFor(period, input)
      return {
        period,
        basis: 'accrual',
        current,
        ...withNet({
          income: plan.income.total,
          corrections: plan.corrections.total,
          bills: plan.bills.total,
          spending: plan.expenses.total,
        }),
        ...apart,
        carriedIn: plan.carriedIn,
        leftover: current ? null : plan.leftover,
      }
    })
}

/**
 * Money in and out over any range: cash before the start, accrual from it (the same split
 * as the rows, so a report for a period says what its row says).
 */
export function flowsBetween(range: DateRange, input: ReviewInput): PeriodTotals {
  const start = input.plan.startDate
  if (start === null) return withNet(cashTotals(range, input))
  const before = cashTotals({ start: range.start, end: minDate(range.end, start) }, input)
  const after = accrualTotals(range, input)
  return withNet({
    income: before.income + after.income,
    corrections: before.corrections + after.corrections,
    bills: before.bills + after.bills,
    spending: before.spending + after.spending,
  })
}

/** Column totals for the year tiles and the table footer. */
export function totalRows(rows: readonly (PeriodTotals & KeptApart)[]): PeriodTotals & KeptApart {
  const total = (k: keyof (PeriodTotals & KeptApart)) => sum(rows.map((r) => r[k]))
  return {
    income: total('income'),
    corrections: total('corrections'),
    bills: total('bills'),
    spending: total('spending'),
    net: total('net'),
    saved: total('saved'),
    debtPaid: total('debtPaid'),
  }
}

export const yearRange = (year: number): DateRange => ({
  start: makeDate(year, 1, 1),
  end: makeDate(year + 1, 1, 1),
})

/** Years Look back can show: from the start of the history up to this year. */
export function reviewYears(input: ReviewInput): number[] {
  const thisYear = Number(input.today.slice(0, 4))
  const first = Math.min(thisYear, Number(historyStart(input).slice(0, 4)))
  return Array.from({ length: thisYear - first + 1 }, (_, i) => first + i)
}
