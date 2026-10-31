// A debt owns a linked minimum-payment Bill (bill.debtId), so the minimum shows up in the
// calendar and in safe-to-spend like any other bill. Every write keeps the pair in sync
// inside one transaction, so one undo step reverts both.
import type { Bill, Debt, Id } from '../../domain/types'
import { db } from '../schema'
import { mutate, type Writer } from '../undo'
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

export function addDebt(input: Omit<Debt, 'id'>) {
  return mutate('Add debt', ['debts', 'bills'], async (w) => {
    const debt: Debt = { ...input, id: newId() }
    const bill = minimumBill(debt)
    await debts.put(w, debt)
    await bills.put(w, bill)
    return { debt, bill }
  })
}

async function syncBills(w: Writer, debt: Debt) {
  for (const bill of alive(await linkedBills(debt.id))) {
    const rule = bill.rule.freq === 'monthly' ? { ...bill.rule, day: debt.dueDay } : bill.rule
    await bills.put(w, { ...bill, name: debt.name, amount: debt.minPayment, rule })
  }
}

export function updateDebt(id: Id, patch: Partial<Omit<Debt, 'id'>>) {
  return mutate('Edit debt', ['debts', 'bills'], async (w) => {
    const next = patchRow(await debts.load(w, id), patch)
    await debts.put(w, next)
    await syncBills(w, next)
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
