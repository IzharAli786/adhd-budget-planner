// Check-in rules (PLAN §4.1): which money is already inside the balance the user typed,
// and which still has to be added or taken off. Getting this wrong double-counts a bill
// (or forgets one), so every rule is a small pure function with its own test.
//
// Instants are compared as strings. Every one we write comes from toISOString(), which is
// fixed-width UTC ('2026-10-31T12:00:00.000Z'), so lexical order IS time order.
import type { BillEntry } from './bills'
import type { Cents } from './money'
import { minDate } from './dates'
import type { BalanceCheckIn, Bill, BillOccurrence, Id, ISODate, Transaction } from './types'

export type CheckInLike = Pick<BalanceCheckIn, 'at' | 'date' | 'balance'>

/**
 * A transaction moves the balance only if it was entered after the check-in and the user
 * didn't say it was already in the bank balance. createdAt, not date: a coffee logged
 * tonight for this morning happened after a check-in made at noon only if it was ENTERED
 * after it; if not, we ask (see askIfInBalance).
 */
export function isCounted(tx: Transaction, checkIn: Pick<CheckInLike, 'at'>): boolean {
  return tx.deletedAt === undefined && !tx.inBalance && tx.createdAt > checkIn.at
}

export function countedTransactions(
  txs: readonly Transaction[],
  checkIn: Pick<CheckInLike, 'at'>,
): Transaction[] {
  return txs.filter((t) => isCounted(t, checkIn))
}

/** A backdated entry (dated before the last check-in) may already be in the balance. */
export function askIfInBalance(date: ISODate, checkIn: Pick<CheckInLike, 'date'> | undefined) {
  return checkIn !== undefined && date < checkIn.date
}

/** Money spent from the balance: outgoing, and not a move into savings or a bill payment. */
export function isSpend(tx: Transaction): boolean {
  return tx.amount < 0 && tx.fundId === undefined && tx.billOccurrenceId === undefined
}

export interface PaidSince {
  billId: Id
  originalDate: ISODate
  name: string
  amount: Cents
}

/**
 * Bills marked paid after the check-in. Marking paid drops a bill from "bills due", so
 * unless the payment also leaves the balance, safe-to-spend would jump by the bill's
 * amount the moment you tick it. Bills paid at or before the check-in (including the
 * autopay ones the check-in itself marks) are already in the typed balance. A bill paid
 * through a logged transaction is counted by that transaction instead.
 */
export function paidSinceCheckIn(
  occurrences: readonly BillOccurrence[],
  bills: readonly Bill[],
  counted: readonly Transaction[],
  checkIn: Pick<CheckInLike, 'at'>,
): PaidSince[] {
  const byId = new Map(bills.map((b) => [b.id, b]))
  const viaTx = new Set(counted.map((t) => t.billOccurrenceId).filter(Boolean))
  const out: PaidSince[] = []
  for (const o of occurrences) {
    if (o.status !== 'paid' || o.paidAt === undefined || o.paidAt <= checkIn.at) continue
    if (viaTx.has(o.id)) continue
    const bill = byId.get(o.billId)
    out.push({
      billId: o.billId,
      originalDate: o.originalDate,
      name: bill?.name ?? '',
      amount: o.paidAmount ?? o.amountOverride ?? bill?.amount ?? 0,
    })
  }
  return out.sort((a, b) => (a.originalDate < b.originalDate ? -1 : 1))
}

/**
 * How far back unpaid bills still count as due: the payday before the check-in, or the
 * check-in itself, whichever is earlier (PLAN §4.1). Tied to the check-in, not to today,
 * so it stays put as days pass: if it slid forward on payday, an unpaid bill would drop
 * out and safe-to-spend would rise with no money coming in.
 */
export function lookbackStart(checkInDate: ISODate, paydayBeforeCheckIn: ISODate | null): ISODate {
  return paydayBeforeCheckIn ? minDate(checkInDate, paydayBeforeCheckIn) : checkInDate
}

/** Did a payday happen after the last check-in? Then the balance misses the pay. */
export function paydaySinceCheckIn(periodStart: ISODate, checkInDate: ISODate): boolean {
  return periodStart > checkInDate
}

export interface CheckInPlan {
  /** Autopay bills dated on or before the check-in: marked paid automatically. */
  autoPaid: BillEntry[]
  /** Manual bills dated on or before the check-in: "Did these come out yet?" */
  ask: BillEntry[]
}

/**
 * What a check-in on `date` reconciles. `due` are the unpaid entries safe-to-spend
 * currently counts (see safeToSpend's dueEntries). The new balance already reflects the
 * autopay ones, so marking them paid keeps them from being taken off a second time.
 */
export function checkInPlan(due: readonly BillEntry[], date: ISODate): CheckInPlan {
  const plan: CheckInPlan = { autoPaid: [], ask: [] }
  for (const e of due) {
    if (e.status !== 'due' || e.date > date) continue
    if (e.autopay) plan.autoPaid.push(e)
    else plan.ask.push(e)
  }
  return plan
}
