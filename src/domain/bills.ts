// Bills across the whole app: expanding every series into dated entries, grouping them
// for the upcoming list, and mapping between the bill form's "repeat" choice and a stored
// Recurrence. Pure: callers pass today and the rows they read.
import { addDays, makeDate, parseISODate } from './dates'
import type { Cents } from './money'
import { paydaysBetween } from './paySchedule'
import { expandOccurrences, ruleDates, seriesStart, type Occurrence } from './recurrence'
import type {
  Bill,
  BillOccurrence,
  Id,
  IncomeSource,
  ISODate,
  PaydayOverride,
  Recurrence,
} from './types'

export interface BillEntry extends Occurrence {
  name: string
  autopay: boolean
  debtId?: Id
}

/** Every bill's occurrences whose effective date is in [from, to), sorted by date then name. */
export function billEntriesBetween(
  bills: readonly Bill[],
  overrides: readonly BillOccurrence[],
  from: ISODate,
  to: ISODate,
): BillEntry[] {
  const byBill = new Map<Id, BillOccurrence[]>()
  for (const o of overrides) {
    const list = byBill.get(o.billId)
    if (list) list.push(o)
    else byBill.set(o.billId, [o])
  }
  const out: BillEntry[] = []
  for (const bill of bills) {
    if (bill.deletedAt !== undefined) continue
    for (const occ of expandOccurrences(bill, from, to, byBill.get(bill.id))) {
      out.push({
        ...occ,
        name: bill.name,
        autopay: bill.autopay,
        ...(bill.debtId ? { debtId: bill.debtId } : {}),
      })
    }
  }
  return out.sort(compareEntries)
}

function compareEntries(a: BillEntry, b: BillEntry) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  return a.name.localeCompare(b.name) || (a.billId < b.billId ? -1 : a.billId > b.billId ? 1 : 0)
}

export interface UpcomingGroups {
  /** Still due, dated before today. */
  overdue: BillEntry[]
  /** [periodStart, periodEnd), minus the overdue ones. Paid ones stay so progress shows. */
  thisPeriod: BillEntry[]
  /** [periodEnd, laterEnd). */
  later: BillEntry[]
}

/**
 * Splits entries for the Bills list. Skipped entries are left out: they cost nothing and
 * would only add noise (the calendar day sheet still shows them, with a way back).
 */
export function groupUpcoming(
  entries: readonly BillEntry[],
  today: ISODate,
  period: { start: ISODate; end: ISODate },
  laterEnd: ISODate,
  /** Day each bill was added. A bill entered today with a January anchor is not 10 months
   * overdue: occurrences before it existed in the app are history, not debts. */
  addedOn: ReadonlyMap<Id, ISODate> = new Map(),
): UpcomingGroups {
  const groups: UpcomingGroups = { overdue: [], thisPeriod: [], later: [] }
  for (const e of entries) {
    if (e.status === 'skipped') continue
    if (e.status === 'due' && e.date < today) {
      const added = addedOn.get(e.billId)
      if (added === undefined || e.date >= added) groups.overdue.push(e)
      continue
    }
    if (e.date >= period.start && e.date < period.end) groups.thisPeriod.push(e)
    else if (e.date >= period.end && e.date < laterEnd) groups.later.push(e)
  }
  return groups
}

export interface EntryTotals {
  /** Still to pay. */
  due: Cents
  paid: Cents
  dueCount: number
  paidCount: number
}

export function totalsOf(entries: readonly Pick<BillEntry, 'status' | 'amount'>[]): EntryTotals {
  const t: EntryTotals = { due: 0, paid: 0, dueCount: 0, paidCount: 0 }
  for (const e of entries) {
    if (e.status === 'due') {
      t.due += e.amount
      t.dueCount++
    } else if (e.status === 'paid') {
      t.paid += e.amount
      t.paidCount++
    }
  }
  return t
}

export function groupByDate<T extends { date: ISODate }>(items: readonly T[]): Map<ISODate, T[]> {
  const map = new Map<ISODate, T[]>()
  for (const item of items) {
    const list = map.get(item.date)
    if (list) list.push(item)
    else map.set(item.date, [item])
  }
  return map
}

export interface PaydayEntry {
  incomeId: Id
  name: string
  amount: Cents
  primary: boolean
  /** The schedule's date, which identifies the payday (and keys its override). */
  nominal: ISODate
  date: ISODate
  overridden: boolean
}

/** Paydays of every active income in [from, to), sorted by date then name. */
export function paydayEntriesBetween(
  incomes: readonly IncomeSource[],
  overrides: readonly PaydayOverride[],
  from: ISODate,
  to: ISODate,
): PaydayEntry[] {
  const out: PaydayEntry[] = []
  for (const income of incomes) {
    if (!income.active) continue
    for (const p of paydaysBetween(income, from, to, overrides)) {
      out.push({
        incomeId: income.id,
        name: income.name,
        amount: income.amount,
        primary: income.primary,
        ...p,
      })
    }
  }
  return out.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.name.localeCompare(b.name),
  )
}

// --- Occurrence overrides ---------------------------------------------------------------

type OccurrenceFields = Omit<BillOccurrence, 'id' | 'billId' | 'originalDate'>

/**
 * Status 'moved' doubles as "adjusted but still due": the row exists because the date
 * (movedTo) or the amount (amountOverride) differs from the rule, not because it was paid.
 * This keeps the stored shape from PLAN §3.3 while letting a paid bill keep its move.
 */
const ADJUSTED = 'moved' as const

/** Marks paid, keeping any move and amount change. */
export function paidFields(
  existing: OccurrenceFields | undefined,
  paidAmount: Cents,
  paidAt: string,
  auto = false,
): OccurrenceFields {
  const base = adjustments(existing)
  return { ...base, status: 'paid', paidAmount, paidAt, ...(auto ? { auto } : {}) }
}

export function skippedFields(existing: OccurrenceFields | undefined): OccurrenceFields {
  return { ...adjustments(existing), status: 'skipped' }
}

/** Moves the occurrence; moving back to its own date drops the move. Null = nothing left. */
export function movedFields(
  existing: OccurrenceFields | undefined,
  originalDate: ISODate,
  movedTo: ISODate,
): OccurrenceFields | null {
  const base: OccurrenceFields = { ...(existing ?? { status: ADJUSTED }) }
  if (movedTo === originalDate) delete base.movedTo
  else base.movedTo = movedTo
  return isEmpty(base) ? null : base
}

/**
 * "Just this one" amount change. Null = nothing left to store. On a paid occurrence it
 * corrects what was paid: the displayed amount of a paid bill IS its paidAmount, so
 * only touching amountOverride would silently do nothing.
 */
export function amountFields(
  existing: OccurrenceFields | undefined,
  billAmount: Cents,
  amount: Cents,
): OccurrenceFields | null {
  const base: OccurrenceFields = { ...(existing ?? { status: ADJUSTED }) }
  if (base.status === 'paid') base.paidAmount = amount
  if (amount === billAmount) delete base.amountOverride
  else base.amountOverride = amount
  return isEmpty(base) ? null : base
}

/** Back to due (unpaid / unskipped), keeping the date and amount adjustments. */
export function dueAgainFields(existing: OccurrenceFields | undefined): OccurrenceFields | null {
  const base = adjustments(existing)
  return base.movedTo === undefined && base.amountOverride === undefined ? null : base
}

function adjustments(existing: OccurrenceFields | undefined): OccurrenceFields {
  const out: OccurrenceFields = { status: ADJUSTED }
  if (existing?.movedTo !== undefined) out.movedTo = existing.movedTo
  if (existing?.amountOverride !== undefined) out.amountOverride = existing.amountOverride
  return out
}

function isEmpty(f: OccurrenceFields) {
  return f.status === ADJUSTED && f.movedTo === undefined && f.amountOverride === undefined
}

// --- Bill form <-> Recurrence -----------------------------------------------------------

export const REPEATS = ['once', 'weekly', 'biweekly', 'monthly', 'yearly'] as const
export type Repeat = (typeof REPEATS)[number]

export interface RepeatChoice {
  repeat: Repeat
  /** First (or only) due date. */
  start: ISODate
  /** Monthly only: always the last day of the month instead of start's day number. */
  lastDay: boolean
}

export function ruleFromChoice({ repeat, start, lastDay }: RepeatChoice): Recurrence {
  switch (repeat) {
    case 'once':
      return { freq: 'once', date: start }
    case 'weekly':
      return { freq: 'weekly', interval: 1, anchor: start }
    case 'biweekly':
      return { freq: 'weekly', interval: 2, anchor: start }
    case 'monthly':
      return {
        freq: 'monthly',
        interval: 1,
        day: lastDay ? 'last' : parseISODate(start).day,
        anchor: start,
      }
    case 'yearly': {
      const { month, day } = parseISODate(start)
      return { freq: 'yearly', month, day, start }
    }
  }
}

/**
 * The form's view of a stored rule. Rules the form can't express exactly (every 3 weeks,
 * from a backup or a future editor) map to the nearest choice; `exact` says so, and the
 * form then leaves the rule alone unless the user touches the repeat fields.
 */
export function choiceFromRule(
  rule: Recurrence,
  today: ISODate,
): RepeatChoice & { exact: boolean } {
  switch (rule.freq) {
    case 'once':
      return { repeat: 'once', start: rule.date, lastDay: false, exact: true }
    case 'weekly':
      return {
        repeat: rule.interval === 2 ? 'biweekly' : 'weekly',
        start: rule.anchor,
        lastDay: false,
        exact: rule.interval === 1 || rule.interval === 2,
      }
    case 'monthly':
      // After a split the anchor can be a clamped date (a "31st" bill anchored on Nov 30),
      // which the form cannot express; `exact` is then false and the rule is kept as is.
      return {
        repeat: 'monthly',
        start: rule.anchor,
        lastDay: rule.day === 'last',
        exact:
          rule.interval === 1 &&
          (rule.day === 'last' || rule.day === parseISODate(rule.anchor).day),
      }
    case 'yearly': {
      const start = seriesStart(rule) ?? makeDate(parseISODate(today).year, rule.month, rule.day)
      return { repeat: 'yearly', start, lastDay: false, exact: true }
    }
  }
}

/** Structural equality of two rules (flat objects; key order may differ after a restore). */
export function sameRule(a: Recurrence, b: Recurrence): boolean {
  const ra = a as unknown as Record<string, unknown>
  const rb = b as unknown as Record<string, unknown>
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)])
  return [...keys].every((k) => ra[k] === rb[k])
}

/**
 * A rule edited for "this and following" must not reach back before the split date, or
 * the new series would repeat dates the old one already covers. Re-anchors the rule on
 * its first date on or after `from`, keeping its shape (a "31st" rule stays the 31st).
 */
export function rebaseRule(rule: Recurrence, from: ISODate): Recurrence {
  const start = seriesStart(rule)
  if (start !== null && start >= from) return rule
  if (rule.freq === 'once') return { ...rule, date: from }
  const first = ruleDates(rule, from, addDays(from, 400))[0] ?? from
  switch (rule.freq) {
    case 'weekly':
    case 'monthly':
      return { ...rule, anchor: first }
    case 'yearly':
      return { ...rule, start: first }
  }
}
