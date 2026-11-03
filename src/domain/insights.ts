// Where the money went in a period: per envelope (when envelopes are on) or per broad
// category (when they are off). Pure, so the Plan charts, Look back and the printed
// report all read the same numbers.
//
// Only spending and plain bills (PLAN-v2 A2): savings moves, debt payments and
// corrections are kept apart and never appear here. "Actual" means dated on or before
// today and not skipped, so an autopay bill the bank already took counts (R4). Every row
// is "money out" in positive cents; a refund lowers its envelope but never below zero.
import { billEntriesBetween } from './bills'
import { addDays, minDate } from './dates'
import { budgetFor, txKind } from './ledger'
import type { Cents } from './money'
import type { Bill, BillOccurrence, DateRange, Envelope, Id, ISODate, Transaction } from './types'

export type { DateRange }

export interface EnvelopeSpend {
  /** null is "Unsorted": spending with no envelope to land in (no default envelope). */
  envelopeId: Id | null
  name: string
  /** The envelope's budget for the period (pastBudgets apply); 0 for Unsorted. */
  planned: Cents
  actual: Cents
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const within = (date: ISODate, r: DateRange) => date >= r.start && date < r.end
const live = <T extends { deletedAt?: string }>(rows: readonly T[]) =>
  rows.filter((r) => r.deletedAt === undefined)

/** Plain-bill entries in the range, not skipped (debt bills belong to Debt, A2). */
function plainEntries(
  bills: readonly Bill[],
  occurrences: readonly BillOccurrence[],
  range: DateRange,
) {
  return billEntriesBetween(bills, occurrences, range.start, range.end).filter(
    (e) => e.status !== 'skipped' && e.debtId === undefined,
  )
}

/**
 * Spending per envelope, the same attribution safe to spend uses (ledger §1.4): spending
 * goes to its envelope if live, else the default one; a refund only to a live envelope
 * it names; a plain bill linked to a live envelope uses it up. Dated up to today.
 */
export function spendByEnvelope(
  transactions: readonly Transaction[],
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  envelopes: readonly Envelope[],
  period: DateRange,
  today: ISODate,
): EnvelopeSpend[] {
  const envs = live(envelopes)
  const known = new Set(envs.map((e) => e.id))
  const fallback = envs.find((e) => e.isDefault)?.id ?? null
  const actual = new Map<Id | null, Cents>()
  const add = (id: Id | null, cents: Cents) => actual.set(id, (actual.get(id) ?? 0) + cents)
  const upTo = { start: period.start, end: minDate(period.end, addDays(today, 1)) }

  for (const t of live(transactions)) {
    if (!within(t.date, upTo)) continue
    const k = txKind(t)
    if (k !== 'expense' && k !== 'refund') continue
    const tagged = t.envelopeId !== undefined && known.has(t.envelopeId)
    if (k === 'refund' && !tagged) continue
    add(tagged ? t.envelopeId! : fallback, -t.amount)
  }
  const billEnvelope = new Map(bills.map((b) => [b.id, b.envelopeId]))
  for (const e of plainEntries(bills, occurrences, upTo)) {
    const id = billEnvelope.get(e.billId)
    if (id !== undefined && known.has(id)) add(id, e.amount)
  }

  const rows: EnvelopeSpend[] = envs.map((e) => ({
    envelopeId: e.id,
    name: e.name,
    planned: budgetFor(e, period),
    actual: Math.max(0, actual.get(e.id) ?? 0),
  }))
  const unsorted = actual.get(null) ?? 0
  if (unsorted > 0) rows.push({ envelopeId: null, name: 'Unsorted', planned: 0, actual: unsorted })
  return rows
}

export type CategoryId = 'everyday' | 'bills'

export interface CategorySpend {
  id: CategoryId
  name: string
  /** What the plan expected (every plain bill dated in the range); null where nothing is
   *  planned up front (everyday spending). */
  planned: Cents | null
  actual: Cents
}

export const CATEGORY_NAMES: Record<CategoryId, string> = {
  everyday: 'Everyday spending',
  bills: 'Bills',
}

function billRow(
  bills: readonly Bill[],
  occurrences: readonly BillOccurrence[],
  period: DateRange,
  today: ISODate,
): CategorySpend {
  const entries = plainEntries(bills, occurrences, period)
  return {
    id: 'bills',
    name: CATEGORY_NAMES.bills,
    planned: sum(entries.map((e) => e.amount)),
    actual: sum(entries.filter((e) => e.date <= today).map((e) => e.amount)),
  }
}

/** With envelopes off, money out falls into two plain groups: everyday spending and bills. */
export function spendByCategory(
  transactions: readonly Transaction[],
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  period: DateRange,
  today: ISODate,
): CategorySpend[] {
  const everyday = -sum(
    live(transactions)
      .filter((t) => within(t.date, period) && t.date <= today)
      .filter((t) => {
        const k = txKind(t)
        return k === 'expense' || k === 'refund'
      })
      .map((t) => t.amount),
  )
  return [
    { id: 'everyday', name: CATEGORY_NAMES.everyday, planned: null, actual: Math.max(0, everyday) },
    billRow(bills, occurrences, period, today),
  ]
}

/**
 * With envelopes on, the money out that no envelope holds: plain bills not linked to a
 * live envelope. Shown beside the envelopes, so rent still appears in where the money
 * goes. A bill linked to an envelope is already in it, so nothing counts twice.
 */
export function spendOutsideEnvelopes(
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  envelopes: readonly Envelope[],
  period: DateRange,
  today: ISODate,
): CategorySpend[] {
  const known = new Set(live(envelopes).map((e) => e.id))
  const unlinked = bills.filter((b) => b.envelopeId === undefined || !known.has(b.envelopeId))
  return [billRow(unlinked, occurrences, period, today)]
}

export interface Share<T> {
  row: T
  /** 0..1 of the total. */
  share: number
}

/**
 * The biggest rows by actual, largest first, each with its share of the total. Rows at
 * zero are left out (a donut has no slice for them); anything past `limit` is summed into
 * `rest`, so a chart never has more slices than it can colour apart.
 */
export function topCategories<T extends { actual: Cents }>(
  rows: readonly T[],
  limit = 6,
): { top: Share<T>[]; rest: Cents; total: Cents } {
  const positive = rows.filter((r) => r.actual > 0).sort((a, b) => b.actual - a.actual)
  const total = sum(positive.map((r) => r.actual))
  // Keep `limit` slices in all: limit-1 rows plus "Everything else" when there are more.
  const keep = positive.length > limit ? limit - 1 : positive.length
  const top = positive.slice(0, keep).map((row) => ({ row, share: total ? row.actual / total : 0 }))
  const rest = sum(positive.slice(keep).map((r) => r.actual))
  return { top, rest, total }
}
