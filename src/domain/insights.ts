// Where the money went in a period: per envelope (when envelopes are on) or per broad
// category (when they are off). Pure, so the Plan charts, Look back and the printed
// report all read the same numbers.
//
// Every row is "money out" in positive cents. A refund tagged to an envelope lowers its
// actual, like it does in safe-to-spend, so a row can end up at zero but is never shown
// as negative spending.
import { billEntriesBetween, type BillEntry } from './bills'
import type { Cents } from './money'
import type { Bill, BillOccurrence, Envelope, Id, ISODate, SavingsFund, Transaction } from './types'

/** [start, end): end is exclusive, like a pay period ending on the next payday. */
export interface DateRange {
  start: ISODate
  end: ISODate
}

export interface EnvelopeSpend {
  /** null is "Unsorted": spending with no envelope to land in (no default envelope). */
  envelopeId: Id | null
  name: string
  /** The envelope's budget for one pay period; 0 for Unsorted. */
  planned: Cents
  actual: Cents
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const within = (date: ISODate, r: DateRange) => date >= r.start && date < r.end
const live = <T extends { deletedAt?: string }>(rows: readonly T[]) =>
  rows.filter((r) => r.deletedAt === undefined)

/** Everyday money out: not a move into savings, not a debt payment, not a bill payment. */
export const isEverydaySpend = (t: Transaction) =>
  t.fundId === undefined && t.debtId === undefined && t.billOccurrenceId === undefined

/**
 * A payment logged against a debt. One logged for a bill occurrence (the debt's minimum)
 * is left out: that money already counts once, as the paid bill.
 */
export const isDebtPayment = (t: Transaction) =>
  t.debtId !== undefined && t.fundId === undefined && t.billOccurrenceId === undefined

/** Paid bill entries whose (moved) date is in the range. */
export function paidBillsIn(
  bills: readonly Bill[],
  occurrences: readonly BillOccurrence[],
  range: DateRange,
): BillEntry[] {
  return billEntriesBetween(bills, occurrences, range.start, range.end).filter(
    (e) => e.status === 'paid',
  )
}

/**
 * Spending per envelope, the same attribution safe-to-spend uses: untagged spending (or
 * spending tagged with a deleted envelope) goes to the default envelope, and a bill linked
 * to an envelope uses it up once it is paid. Untagged money IN is not an envelope's money.
 */
export function spendByEnvelope(
  transactions: readonly Transaction[],
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  envelopes: readonly Envelope[],
  period: DateRange,
): EnvelopeSpend[] {
  const envs = live(envelopes)
  const known = new Set(envs.map((e) => e.id))
  const fallback = envs.find((e) => e.isDefault)?.id ?? null
  const actual = new Map<Id | null, Cents>()
  const add = (id: Id | null, cents: Cents) => actual.set(id, (actual.get(id) ?? 0) + cents)

  for (const t of live(transactions)) {
    if (!isEverydaySpend(t) || !within(t.date, period)) continue
    const tagged = t.envelopeId !== undefined && known.has(t.envelopeId)
    if (t.amount >= 0 && !tagged) continue
    add(tagged ? t.envelopeId! : fallback, -t.amount)
  }
  const billEnvelope = new Map(bills.map((b) => [b.id, b.envelopeId]))
  for (const e of paidBillsIn(bills, occurrences, period)) {
    const id = billEnvelope.get(e.billId)
    if (id !== undefined && known.has(id)) add(id, e.amount)
  }

  const rows: EnvelopeSpend[] = envs.map((e) => ({
    envelopeId: e.id,
    name: e.name,
    planned: e.budget,
    actual: Math.max(0, actual.get(e.id) ?? 0),
  }))
  const unsorted = actual.get(null) ?? 0
  if (unsorted > 0) rows.push({ envelopeId: null, name: 'Unsorted', planned: 0, actual: unsorted })
  return rows
}

export type CategoryId = 'everyday' | 'bills' | 'savings' | 'debt'

export interface CategorySpend {
  id: CategoryId
  name: string
  /** What the plan expected (all bills dated in the range, savings per payday); null
   *  where nothing is planned up front (everyday spending). */
  planned: Cents | null
  actual: Cents
}

export const CATEGORY_NAMES: Record<CategoryId, string> = {
  everyday: 'Everyday spending',
  bills: 'Bills',
  savings: 'Savings',
  debt: 'Debt',
}

/**
 * With envelopes off, money out falls into four plain groups: everyday spending, bills,
 * savings and debt payments (a debt's minimum is a linked bill, so it counts as debt).
 * `periods` is how many pay periods the range spans, for the savings plan.
 */
export function spendByCategory(
  transactions: readonly Transaction[],
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  funds: readonly SavingsFund[],
  period: DateRange,
  periods = 1,
): CategorySpend[] {
  const txs = live(transactions).filter((t) => within(t.date, period))
  const everyday =
    0 - sum(txs.filter((t) => isEverydaySpend(t) && t.amount < 0).map((t) => t.amount))
  const saved = 0 - sum(txs.filter((t) => t.fundId !== undefined).map((t) => t.amount))
  const debtTx = 0 - sum(txs.filter(isDebtPayment).map((t) => t.amount))
  const entries = billEntriesBetween(bills, occurrences, period.start, period.end).filter(
    (e) => e.status !== 'skipped',
  )
  const of = (debt: boolean, paidOnly: boolean) =>
    sum(
      entries
        .filter((e) => (e.debtId !== undefined) === debt && (!paidOnly || e.status === 'paid'))
        .map((e) => e.amount),
    )
  return [
    { id: 'everyday', name: CATEGORY_NAMES.everyday, planned: null, actual: everyday },
    { id: 'bills', name: CATEGORY_NAMES.bills, planned: of(false, false), actual: of(false, true) },
    {
      id: 'savings',
      name: CATEGORY_NAMES.savings,
      planned: sum(live(funds).map((f) => f.perPeriod)) * periods,
      actual: Math.max(0, saved),
    },
    {
      id: 'debt',
      name: CATEGORY_NAMES.debt,
      planned: of(true, false),
      actual: of(true, true) + debtTx,
    },
  ]
}

/**
 * With envelopes on, the money out that no envelope holds: bills not linked to one, and
 * debt payments (paid minimums plus payments logged against a debt). Shown beside the
 * envelopes, so rent and the car loan still appear in where the money goes. Nothing counts
 * twice: a bill linked to an envelope is already in it, and a payment logged for a bill
 * occurrence is that bill (isDebtPayment leaves it out).
 */
export function spendOutsideEnvelopes(
  transactions: readonly Transaction[],
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  envelopes: readonly Envelope[],
  period: DateRange,
): CategorySpend[] {
  const known = new Set(live(envelopes).map((e) => e.id))
  const linked = new Set(
    bills.filter((b) => b.envelopeId !== undefined && known.has(b.envelopeId)).map((b) => b.id),
  )
  const entries = billEntriesBetween(bills, occurrences, period.start, period.end).filter(
    (e) => e.status !== 'skipped' && !linked.has(e.billId),
  )
  const of = (debt: boolean, paidOnly: boolean) =>
    sum(
      entries
        .filter((e) => (e.debtId !== undefined) === debt && (!paidOnly || e.status === 'paid'))
        .map((e) => e.amount),
    )
  const debtTx =
    0 -
    sum(
      live(transactions)
        .filter((t) => isDebtPayment(t) && within(t.date, period))
        .map((t) => t.amount),
    )
  return [
    { id: 'bills', name: CATEGORY_NAMES.bills, planned: of(false, false), actual: of(false, true) },
    {
      id: 'debt',
      name: CATEGORY_NAMES.debt,
      planned: of(true, false),
      actual: of(true, true) + debtTx,
    },
  ]
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
