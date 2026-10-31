// The transaction log's selection: which pay period or month, which envelope, which words.
// Pure, so the screen only renders and the filters are table- and property-tested.
import { addDays, addMonths, makeDate, parseISODate } from './dates'
import type { Cents } from './money'
import { nextPayday, previousPayday } from './paySchedule'
import type { Id, IncomeSource, ISODate, PaydayOverride, Transaction } from './types'

/** [start, end) like PayPeriod; `kind` says how to label it. */
export interface LogRange {
  kind: 'period' | 'month' | 'all'
  start: ISODate
  end: ISODate
}

export const ALL_TIME: LogRange = { kind: 'all', start: '0000-01-01', end: '9999-12-31' }

/**
 * The current pay period and up to `count - 1` before it, newest first. Each period runs
 * from one payday to the next, so they tile with no gaps. Empty without a payday to
 * anchor on (no income, or an irregular schedule with nothing ahead).
 */
export function payPeriods(
  income: Pick<IncomeSource, 'id' | 'schedule' | 'weekendRule'> | undefined,
  today: ISODate,
  overrides: readonly PaydayOverride[] = [],
  count = 4,
): LogRange[] {
  if (!income) return []
  let end = nextPayday(income, today, overrides)
  let start = previousPayday(income, today, overrides)
  if (!end) return []
  // Like currentPeriod: before the first payday, this period starts today.
  if (!start) return [{ kind: 'period', start: today, end }]
  const out: LogRange[] = []
  while (start && out.length < count) {
    out.push({ kind: 'period', start, end })
    end = start
    start = previousPayday(income, addDays(start, -1), overrides)
  }
  return out
}

/** Calendar month containing `date`, as a range. */
export function monthRange(date: ISODate): LogRange {
  const { year, month } = parseISODate(date)
  const start = makeDate(year, month, 1)
  return { kind: 'month', start, end: addMonths(start, 1) }
}

/** Years that have entries, plus the current one, newest first (the year pills). */
export function logYears(transactions: readonly Pick<Transaction, 'date'>[], today: ISODate) {
  const years = new Set([today.slice(0, 4), ...transactions.map((t) => t.date.slice(0, 4))])
  return [...years].sort().reverse()
}

/**
 * Every month of `year`, January first: a fixed row of 12 is easier to scan than only
 * the months with entries. The current year stops at this month; nothing is ahead.
 */
export function yearMonths(year: string, today: ISODate): LogRange[] {
  const last = year === today.slice(0, 4) ? parseISODate(today).month : 12
  return Array.from({ length: last }, (_, i) => monthRange(makeDate(Number(year), i + 1, 1)))
}

export interface LogFilter {
  range: LogRange
  /** An envelope id, or 'none' for entries with no envelope. */
  envelopeId?: Id | 'none'
  /** Words to find in the note, any order, ignoring case and accents. */
  query?: string
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function filterLog<T extends Transaction>(rows: readonly T[], filter: LogFilter): T[] {
  const { range, envelopeId, query } = filter
  const words = fold(query ?? '')
    .split(/\s+/)
    .filter(Boolean)
  return rows.filter((t) => {
    if (t.deletedAt !== undefined || t.date < range.start || t.date >= range.end) return false
    if (
      envelopeId === 'none' ? t.envelopeId !== undefined : envelopeId && t.envelopeId !== envelopeId
    )
      return false
    if (words.length === 0) return true
    const note = fold(t.note)
    return words.every((w) => note.includes(w))
  })
}

export interface LogTotals {
  count: number
  /** Money that came in (positive amounts). */
  in: Cents
  /** Money that went out, as a positive number. */
  out: Cents
  /** Entries on each side, for the averages. */
  inCount: number
  outCount: number
  /** Average money out per spending entry, whole cents; 0 with none. */
  averageOut: Cents
  /** Average money in per incoming entry, whole cents; 0 with none. */
  averageIn: Cents
}

export function logTotals(rows: readonly Pick<Transaction, 'amount'>[]): LogTotals {
  let inSum = 0
  let outSum = 0
  let inCount = 0
  for (const t of rows) {
    if (t.amount > 0) {
      inSum += t.amount
      inCount++
    } else outSum -= t.amount
  }
  const outCount = rows.length - inCount
  // Averaged per side: one salary among twenty coffees would make a mixed average meaningless.
  const avg = (sum: Cents, n: number) => (n === 0 ? 0 : Math.round(sum / n))
  return {
    count: rows.length,
    in: inSum,
    out: outSum,
    inCount,
    outCount,
    averageOut: avg(outSum, outCount),
    averageIn: avg(inSum, inCount),
  }
}

/** Newest day first, and within a day the latest entry first. */
export function newestFirst<T extends Pick<Transaction, 'date' | 'createdAt'>>(rows: readonly T[]) {
  return [...rows].sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
  )
}
