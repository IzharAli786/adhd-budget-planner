// What is still owed on each debt, from one place. Today's "Still owed", the Debt screen's
// rows and payoff plan, and debt-linked life goals all read it, so they always agree.
import { useMemo } from 'react'
import { useBillOccurrences, useBills, useDebts, useTransactions } from '../../db/hooks'
import { billEntriesBetween } from '../../domain/bills'
import { addDays } from '../../domain/dates'
import { debtOwed } from '../../domain/debt'
import type { Cents } from '../../domain/money'
import type { Bill, BillOccurrence, Debt, ISODate, Transaction } from '../../domain/types'
import { useToday } from '../../lib/useToday'

/** A live debt with what is owed on it today (balance less payments since balanceAsOf). */
export type OwedDebt = Debt & { owed: Cents }

// A minimum can be ticked paid before its date (Coming up looks 45 days ahead); a year and a
// bit covers any of those without expanding the schedule years into the future.
const PAID_AHEAD_DAYS = 400

/** Pure: each debt with `owed`, given the rows. Exported for tests and non-React callers. */
export function withOwed(
  debts: readonly Debt[],
  bills: readonly Bill[],
  occurrences: readonly BillOccurrence[],
  transactions: readonly Transaction[],
  today: ISODate,
): OwedDebt[] {
  if (debts.length === 0) return []
  const from = debts.reduce((d, x) => (x.balanceAsOf < d ? x.balanceAsOf : d), today)
  const minimums = billEntriesBetween(
    bills.filter((b) => b.debtId !== undefined),
    occurrences,
    from,
    addDays(today, PAID_AHEAD_DAYS),
  )
  return debts.map((d) => ({ ...d, owed: debtOwed(d, transactions, minimums) }))
}

/** Every live debt with what is still owed on it; undefined while loading. */
export function useDebtsOwed(): OwedDebt[] | undefined {
  const today = useToday()
  const debts = useDebts()
  const bills = useBills()
  const occurrences = useBillOccurrences()
  const transactions = useTransactions()
  return useMemo(
    () =>
      debts && bills && occurrences && transactions
        ? withOwed(debts, bills, occurrences, transactions, today)
        : undefined,
    [debts, bills, occurrences, transactions, today],
  )
}
