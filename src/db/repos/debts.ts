// A debt owns a linked minimum-payment Bill (bill.debtId), so the minimum shows up in the
// calendar and in safe-to-spend like any other bill. Every write keeps the pair in sync
// inside one transaction, so one undo step reverts both.
import { rebaseRule, ruleChangeHidesPaid, sameRule } from '../../domain/bills'
import { addDays, maxDate } from '../../domain/dates'
import { splitSeriesFrom } from '../../domain/recurrence'
import type { Bill, Debt, Id, ISODate } from '../../domain/types'
import { db } from '../schema'
import { mutate, type Writer } from '../undo'
import { SPLIT_TABLES, splitBill } from './bills'
import { softRepo } from './softRepo'
import { alive, newId, nowInstant, patchRow } from './util'

const debts = softRepo<Debt>('debts', 'debt')
const bills = softRepo<Bill>('bills', 'bill')

export const getDebt = debts.get
export const listDebts = debts.list
export const listDeletedDebts = debts.listDeleted

const linkedBills = async (debtId: Id) => db.bills.where('debtId').equals(debtId).toArray()

function minimumBill(debt: Debt): Bill {
  return {
    id: newId(),
    name: debt.name,
    amount: debt.minPayment,
    rule: { freq: 'monthly', interval: 1, day: debt.dueDay, anchor: debt.balanceAsOf },
    debtId: debt.id,
    autopay: false,
    createdAt: nowInstant(),
  }
}

export type NewDebt = Omit<Debt, 'id' | 'originalBalance' | 'deletedAt'>

export function addDebt(input: NewDebt) {
  return mutate('Add debt', ['debts', 'bills'], async (w) => {
    // The starting point for "% paid" is fixed here, so later balance edits show progress.
    const debt: Debt = { ...input, originalBalance: input.balance, id: newId() }
    const bill = minimumBill(debt)
    await debts.put(w, debt)
    await bills.put(w, bill)
    return { debt, bill }
  })
}

/**
 * A paid-off debt has no minimum left to set aside, so its bill ends before today (or after
 * the last month marked paid, so no paid row is hidden). Like splitBill, a bill with no
 * dates left is soft-deleted rather than kept as an empty series.
 */
async function endMinimum(w: Writer, bill: Bill, today: ISODate) {
  const rows = await db.billOccurrences.where('billId').equals(bill.id).toArray()
  const lastPaid = rows
    .filter((o) => o.status === 'paid')
    .reduce((d, o) => maxDate(d, o.originalDate), addDays(today, -1))
  const { before } = splitSeriesFrom(bill, addDays(lastPaid, 1), bill.id)
  await bills.put(w, before ?? { ...bill, deletedAt: nowInstant() })
}

async function syncBills(w: Writer, prev: Debt, debt: Debt, today: ISODate) {
  const live = alive(await linkedBills(debt.id))
  if (debt.balance <= 0) {
    for (const bill of live) if (bill.until === undefined) await endMinimum(w, bill, today)
    return
  }
  // Back above zero (new borrowing, or a mistaken "paid off"): the minimum starts again from
  // today. Only on that transition, so a minimum bill the user deleted stays deleted.
  if (prev.balance <= 0 && !live.some((b) => b.until === undefined)) {
    await bills.put(w, minimumBill({ ...debt, balanceAsOf: today }))
    return
  }
  for (const bill of live) {
    // The ended half of a split is history: a new minimum must not reprice it.
    if (bill.until !== undefined) continue
    const changes = { name: debt.name, amount: debt.minPayment }
    const rule = bill.rule.freq === 'monthly' ? { ...bill.rule, day: debt.dueDay } : bill.rule
    if (!sameRule(rule, bill.rule)) {
      // Same rule as editBill: paid rows are keyed by the old due dates, so moving the
      // due day in place would hide them. Split at today; only the name follows back.
      const rows = await db.billOccurrences.where('billId').equals(bill.id).toArray()
      if (ruleChangeHidesPaid(rows, rule)) {
        const from = { ...changes, rule: rebaseRule(rule, today) }
        await splitBill(w, bill, today, from, { name: debt.name })
        continue
      }
    }
    await bills.put(w, { ...bill, ...changes, rule })
  }
}

export type DebtPatch = Partial<Omit<Debt, 'id' | 'deletedAt'>>

/**
 * Edits a debt and its minimum bill. `today` dates a new balance (balanceAsOf) and is where
 * a due-day change splits the bill if moving it in place would hide paid months. A balance
 * of zero ends the minimum bill; going back above zero starts a new one.
 */
export function updateDebt(id: Id, patch: DebtPatch, today: ISODate) {
  return mutate('Edit debt', ['debts', ...SPLIT_TABLES], async (w) => {
    const prev = await debts.load(w, id)
    const next = patchRow(prev, patch)
    if (patch.balance !== undefined && patch.balance !== prev.balance) {
      if (patch.balanceAsOf === undefined) next.balanceAsOf = today
      // New borrowing on top raises the starting point, so "% paid" never goes below zero.
      if (patch.originalBalance === undefined && next.balance > next.originalBalance)
        next.originalBalance = next.balance
    }
    await debts.put(w, next)
    await syncBills(w, prev, next, today)
    return next
  })
}

/** Soft-deletes the debt and its live linked bills with the same stamp, so restore can pair them. */
export function deleteDebt(id: Id) {
  return mutate('Delete debt', ['debts', 'bills'], async (w) => {
    const deletedAt = nowInstant()
    await debts.put(w, { ...(await debts.load(w, id)), deletedAt })
    for (const bill of alive(await linkedBills(id))) await bills.put(w, { ...bill, deletedAt })
  })
}

export function restoreDebt(id: Id) {
  return mutate('Restore debt', ['debts', 'bills'], async (w) => {
    const debt = { ...(await debts.load(w, id)) }
    const stamp = debt.deletedAt
    delete debt.deletedAt
    await debts.put(w, debt)
    for (const bill of await linkedBills(id)) {
      if (stamp === undefined || bill.deletedAt !== stamp) continue
      const restored = { ...bill }
      delete restored.deletedAt
      await bills.put(w, restored)
    }
  })
}
