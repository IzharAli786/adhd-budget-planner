import {
  amountFields,
  dueAgainFields,
  movedFields,
  paidFields,
  skippedFields,
} from '../../domain/bills'
import { splitSeriesFrom } from '../../domain/recurrence'
import {
  occurrenceId,
  type Bill,
  type BillOccurrence,
  type Id,
  type ISODate,
} from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { softRepo } from './softRepo'
import { NotFoundError, newId, nowInstant } from './util'

const repo = softRepo<Bill>('bills', 'bill')

export const getBill = repo.get
export const listBills = repo.list
export const listDeletedBills = repo.listDeleted
export const updateBill = repo.update
export const deleteBill = repo.remove
export const restoreBill = repo.restore

export function addBill(input: Omit<Bill, 'id' | 'createdAt'>) {
  return repo.add({ ...input, createdAt: nowInstant() })
}

/**
 * "Change from this date on" (RFC 5545 split): the old bill ends the day before `date`,
 * a new bill with `changes` starts at `date`. Occurrence rows stay on the old id, so
 * history keeps its paid amounts. Returns the new bill, or null if nothing follows `date`.
 */
export function editBillFrom(id: Id, date: ISODate, changes: Partial<Omit<Bill, 'id'>>) {
  return mutate('Edit bill from date', ['bills'], async (w) => {
    const bill = await repo.load(w, id)
    const { before, after } = splitSeriesFrom(bill, date, newId())
    if (before) await repo.put(w, before)
    else await repo.put(w, { ...bill, deletedAt: nowInstant() })
    if (!after) return null
    // createdAt is kept: it marks when the bill entered the app, which decides what can
    // be overdue (groupUpcoming). Splitting at a past date must not hide an unpaid bill.
    const next: Bill = { ...after, ...changes, id: after.id, createdAt: bill.createdAt }
    await repo.put(w, next)
    return next
  })
}

export function listOccurrences(billId?: Id) {
  return billId === undefined
    ? db.billOccurrences.toArray()
    : db.billOccurrences.where('billId').equals(billId).toArray()
}

type OccurrencePatch = Omit<BillOccurrence, 'id' | 'billId' | 'originalDate'>
type Merge = (existing: OccurrencePatch | undefined, bill: Bill) => OccurrencePatch | null

// Every per-occurrence change reads the current row and merges into it (domain/bills.ts),
// so paying a moved bill keeps it on its new date. Null from the merge deletes the row.
function changeOccurrence(billId: Id, originalDate: ISODate, label: string, merge: Merge) {
  return mutate(label, ['bills', 'billOccurrences'], async (w) => {
    const bill = await w.get('bills', billId)
    if (!bill) throw new NotFoundError('bills', billId)
    const id = occurrenceId(billId, originalDate)
    const existing = await w.get('billOccurrences', id)
    const fields = merge(existing, bill)
    if (!fields) {
      if (existing) await w.delete('billOccurrences', id)
      return null
    }
    const row: BillOccurrence = { ...fields, id, billId, originalDate }
    await w.put('billOccurrences', row)
    return row
  })
}

/** Replaces the override row for one occurrence as given (no merge). */
export function setOccurrence(
  billId: Id,
  originalDate: ISODate,
  patch: OccurrencePatch,
  label = 'Update bill',
) {
  return changeOccurrence(billId, originalDate, label, () => patch)
}

export function markPaid(billId: Id, originalDate: ISODate, paidAmount: number, auto = false) {
  return changeOccurrence(billId, originalDate, 'Mark bill paid', (o) =>
    paidFields(o, paidAmount, nowInstant(), auto),
  )
}

export function skipOccurrence(billId: Id, originalDate: ISODate) {
  return changeOccurrence(billId, originalDate, 'Skip bill', skippedFields)
}

export function moveOccurrence(billId: Id, originalDate: ISODate, movedTo: ISODate) {
  return changeOccurrence(billId, originalDate, 'Move bill', (o) =>
    movedFields(o, originalDate, movedTo),
  )
}

/** "Just this one" amount change; the series amount stays. */
export function setOccurrenceAmount(billId: Id, originalDate: ISODate, amount: number) {
  return changeOccurrence(billId, originalDate, 'Edit one bill', (o, bill) =>
    amountFields(o, bill.amount, amount),
  )
}

/** Unpaid / unskipped again, keeping a move or amount change. */
export function markDue(billId: Id, originalDate: ISODate) {
  return changeOccurrence(billId, originalDate, 'Mark bill unpaid', dueAgainFields)
}

/** Back to whatever the rule says (unpaid, original date and amount). */
export function clearOccurrence(billId: Id, originalDate: ISODate) {
  return mutate('Reset bill', ['billOccurrences'], (w) =>
    w.delete('billOccurrences', occurrenceId(billId, originalDate)),
  )
}
