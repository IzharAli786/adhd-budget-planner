// Look back's "Savings this year" and "Debt this year" cards (and the printed report).
// Pure, from the same rows as the rest of Look back; the range is already clipped to the
// history, so the numbers agree with the year's tiles and table.
import { daysBetween, minDate } from './dates'
import { isDebtPayment, paidBillsIn, type DateRange } from './insights'
import type { Cents } from './money'
import { fundSaved } from './savings'
import type { Bill, BillOccurrence, Debt, Id, ISODate, SavingsFund, Transaction } from './types'

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)
const within = (date: ISODate, r: DateRange) => date >= r.start && date < r.end
const live = <T extends { deletedAt?: string }>(rows: readonly T[]) =>
  rows.filter((r) => r.deletedAt === undefined)

export interface FundYear {
  id: Id
  name: string
  /** Net moved in over the range (a withdrawal lowers it). */
  savedInRange: Cents
  /** Everything in the fund now, opening amount included. */
  savedTotal: Cents
  target?: Cents
  /** savedTotal as 0..1 of the target (capped at 1); null without a target. */
  ofTarget: number | null
}

export function fundsInRange(
  funds: readonly SavingsFund[],
  transactions: readonly Transaction[],
  range: DateRange,
): FundYear[] {
  const txs = live(transactions)
  return live(funds).map((f) => {
    const savedTotal = fundSaved(f, txs)
    const savedInRange =
      0 - sum(txs.filter((t) => t.fundId === f.id && within(t.date, range)).map((t) => t.amount))
    return {
      id: f.id,
      name: f.name,
      savedInRange,
      savedTotal,
      ...(f.target !== undefined ? { target: f.target } : {}),
      ofTarget: f.target && f.target > 0 ? Math.min(1, Math.max(0, savedTotal / f.target)) : null,
    }
  })
}

export interface DebtYear {
  id: Id
  name: string
  /** Minimums marked paid plus payments logged against it, over the range. */
  paidInRange: Cents
  owed: Cents
  aprBps: number
}

export interface DebtsYear {
  rows: DebtYear[]
  paid: Cents
  owed: Cents
  /** Balance-weighted APR of what is still owed (basis points); null when nothing is. */
  avgAprBps: number | null
  /**
   * A rough interest figure for the range: today's balances at their APR for the days of
   * the range up to today. Balances moved during the year, so it is labelled an estimate.
   */
  interestEstimate: Cents
}

export function debtsInRange(
  debts: readonly Debt[],
  bills: readonly Bill[],
  occurrences: readonly BillOccurrence[],
  transactions: readonly Transaction[],
  range: DateRange,
  today: ISODate,
): DebtsYear {
  const paidBills = paidBillsIn(bills, occurrences, range)
  // isDebtPayment leaves out a payment logged for a bill occurrence: that is the paid bill.
  const payments = live(transactions).filter((t) => isDebtPayment(t) && within(t.date, range))
  const rows = live(debts).map((d) => ({
    id: d.id,
    name: d.name,
    paidInRange:
      sum(paidBills.filter((e) => e.debtId === d.id).map((e) => e.amount)) -
      sum(payments.filter((t) => t.debtId === d.id).map((t) => t.amount)),
    owed: Math.max(0, d.balance),
    aprBps: d.aprBps,
  }))
  const owed = sum(rows.map((r) => r.owed))
  const days = Math.max(0, daysBetween(range.start, minDate(range.end, today)))
  return {
    rows,
    paid: sum(rows.map((r) => r.paidInRange)),
    owed,
    avgAprBps: owed > 0 ? Math.round(sum(rows.map((r) => r.owed * r.aprBps)) / owed) : null,
    interestEstimate: Math.round(sum(rows.map((r) => (r.owed * r.aprBps) / 10000)) * (days / 365)),
  }
}
