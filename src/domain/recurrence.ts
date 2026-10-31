// Bills store a rule; occurrences are expanded on read (PLAN §3.5).
// Every date is computed FROM THE ANCHOR (anchor + k * step), never from the previous
// occurrence. Chaining would compound clamping: Jan 31 -> Feb 28 -> Mar 28 -> ... forever.
import { addDays, daysBetween, makeDate, monthsBetween, parseISODate } from './dates'
import type { Bill, BillOccurrence, Cents, Id, ISODate, Recurrence } from './types'

export interface Occurrence {
  billId: Id
  /** Identity of the occurrence: the date the rule produced. Never changes. */
  originalDate: ISODate
  /** Where it actually lands (movedTo when moved). */
  date: ISODate
  amount: Cents
  status: 'due' | 'paid' | 'skipped'
  moved: boolean
  override?: BillOccurrence
}

const ceilDiv = (a: number, b: number) => -Math.floor(-a / b)
const safeInterval = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1)

/** First date the rule can produce (null for an open-ended yearly rule with no start). */
export function seriesStart(rule: Recurrence): ISODate | null {
  switch (rule.freq) {
    case 'once':
      return rule.date
    case 'weekly':
    case 'monthly':
      return rule.anchor
    case 'yearly':
      return rule.start ?? null
  }
}

/** Dates the rule produces in [from, to), ignoring until and overrides. */
export function ruleDates(rule: Recurrence, from: ISODate, to: ISODate): ISODate[] {
  if (from >= to) return []
  const start = seriesStart(rule)
  const lo = start && start > from ? start : from
  const out: ISODate[] = []
  switch (rule.freq) {
    case 'once':
      if (rule.date >= from && rule.date < to) out.push(rule.date)
      break
    case 'weekly': {
      const step = 7 * safeInterval(rule.interval)
      for (let k = ceilDiv(daysBetween(rule.anchor, lo), step); ; k++) {
        const d = addDays(rule.anchor, k * step)
        if (d >= to) break
        out.push(d)
      }
      break
    }
    case 'monthly': {
      const step = safeInterval(rule.interval)
      const { year, month } = parseISODate(rule.anchor)
      // Start one step early: a clamped/'last' day can sit before `lo` in lo's month.
      for (let k = Math.max(0, Math.floor(monthsBetween(rule.anchor, lo) / step) - 1); ; k++) {
        const index = year * 12 + (month - 1) + k * step
        const d = makeDate(Math.floor(index / 12), (index % 12) + 1, rule.day)
        if (d >= to) break
        if (d >= lo) out.push(d)
      }
      break
    }
    case 'yearly': {
      // Feb 29 clamps to Feb 28 in non-leap years via makeDate, computed per year.
      for (let y = parseISODate(lo).year; ; y++) {
        const d = makeDate(y, rule.month, rule.day)
        if (d >= to) break
        if (d >= lo) out.push(d)
      }
      break
    }
  }
  return out
}

/**
 * Occurrences of a bill whose effective date lies in [from, to), sorted by date.
 * `until` (inclusive, like RFC 5545 UNTIL) limits the ORIGINAL dates, so an occurrence
 * moved past the end of its series still shows up. Skipped ones are returned with
 * status 'skipped' so the UI can show and undo them; filter them out for money maths.
 */
export function expandOccurrences(
  bill: Pick<Bill, 'id' | 'amount' | 'rule' | 'until'>,
  from: ISODate,
  to: ISODate,
  overrides: readonly BillOccurrence[] = [],
): Occurrence[] {
  if (from >= to) return []
  const byDate = new Map<ISODate, BillOccurrence>()
  let pad = 0
  for (const o of overrides) {
    if (o.billId !== bill.id) continue
    byDate.set(o.originalDate, o)
    if (o.movedTo) pad = Math.max(pad, Math.abs(daysBetween(o.originalDate, o.movedTo)))
  }
  let hi = addDays(to, pad)
  if (bill.until !== undefined && bill.until < hi) hi = addDays(bill.until, 1)

  const out: Occurrence[] = []
  for (const originalDate of ruleDates(bill.rule, addDays(from, -pad), hi)) {
    const override = byDate.get(originalDate)
    const date = override?.movedTo ?? originalDate
    if (date < from || date >= to) continue
    const status =
      override?.status === 'paid' ? 'paid' : override?.status === 'skipped' ? 'skipped' : 'due'
    const amount =
      status === 'paid'
        ? (override?.paidAmount ?? override?.amountOverride ?? bill.amount)
        : (override?.amountOverride ?? bill.amount)
    out.push({
      billId: bill.id,
      originalDate,
      date,
      amount,
      status,
      moved: date !== originalDate,
      ...(override ? { override } : {}),
    })
  }
  return out.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.originalDate < b.originalDate ? -1 : 1,
  )
}

/** Next due (not paid, not skipped) occurrence on or after `today`, scanning `horizonDays`. */
export function nextDueOccurrence(
  bill: Pick<Bill, 'id' | 'amount' | 'rule' | 'until'>,
  today: ISODate,
  overrides: readonly BillOccurrence[] = [],
  horizonDays = 366 * 2,
): Occurrence | null {
  return (
    expandOccurrences(bill, today, addDays(today, horizonDays), overrides).find(
      (o) => o.status === 'due',
    ) ?? null
  )
}

/** Re-anchors a rule so the new series starts at `date`, keeping its shape. */
function ruleStartingAt(rule: Recurrence, date: ISODate): Recurrence {
  switch (rule.freq) {
    case 'once':
      return { ...rule, date }
    case 'weekly':
      return { ...rule, anchor: date }
    case 'monthly':
      // Keep rule.day: splitting on a clamped Feb 28 of a "31st" bill still yields Mar 31.
      return { ...rule, anchor: date }
    case 'yearly':
      return { ...rule, start: date }
  }
}

export interface SeriesSplit<T extends Bill> {
  /** The old series ending the day before `date`, or null if it had nothing before it. */
  before: T | null
  /** The new series starting at `date`, or null if the old one had nothing from it on. */
  after: T | null
}

/**
 * "Change this and following" per RFC 5545: end the old series at date-1 and start a
 * copy at `date`. The caller then edits `after`. Overrides keep pointing at the old
 * bill id, so history (paid amounts) is never rewritten.
 */
export function splitSeriesFrom<T extends Bill>(bill: T, date: ISODate, newId: Id): SeriesSplit<T> {
  const { rule } = bill
  if (rule.freq === 'once') {
    return rule.date < date
      ? { before: bill, after: null }
      : { before: null, after: { ...bill, id: newId } }
  }

  // Look at real occurrences rather than the anchor: `date` need not be an occurrence,
  // and re-anchoring on it directly would shift the phase (a Monday series becoming
  // Wednesdays, or an every-2-months bill gaining a month that never existed).
  const span = maxGapDays(rule)
  const end = bill.until !== undefined ? addDays(bill.until, 1) : null
  const cap = (d: ISODate) => (end !== null && end < d ? end : d)
  const beforeEnd = cap(date)
  const hasBefore = ruleDates(rule, addDays(beforeEnd, -span), beforeEnd).length > 0
  const start = seriesStart(rule)
  const lo = start !== null && start > date ? start : date
  const first = ruleDates(rule, lo, cap(addDays(lo, span + 1)))[0]

  const dayBefore = addDays(date, -1)
  const before: T | null = hasBefore
    ? {
        ...bill,
        until: bill.until !== undefined && bill.until < dayBefore ? bill.until : dayBefore,
      }
    : null
  const after: T | null = first ? { ...bill, id: newId, rule: ruleStartingAt(rule, first) } : null
  return { before, after }
}

/** Upper bound on the gap between two consecutive dates of a repeating rule. */
function maxGapDays(rule: Exclude<Recurrence, { freq: 'once' }>): number {
  switch (rule.freq) {
    case 'weekly':
      return 7 * safeInterval(rule.interval)
    case 'monthly':
      // A clamped/'last' day can sit up to a month off the anchor's day of month.
      return 31 * (safeInterval(rule.interval) + 1)
    case 'yearly':
      return 367
  }
}
