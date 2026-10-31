import { paidFields } from '../../domain/bills'
import {
  occurrenceId,
  type BalanceCheckIn,
  type Cents,
  type Id,
  type ISODate,
} from '../../domain/types'
import { db } from '../schema'
import { mutate, type Writer } from '../undo'
import { newId, nowInstant } from './util'

export function addCheckIn(balance: Cents, date: ISODate, at = nowInstant()) {
  return reconcileCheckIn({ balance, date, at, paid: [] })
}

export interface PaidAtCheckIn {
  billId: Id
  originalDate: ISODate
  amount: Cents
  /** True for autopay bills the check-in marked by itself (PLAN §4.1). */
  auto: boolean
}

/**
 * Saves a balance and marks the bills already inside it as paid, in ONE undo step: undo
 * must not leave a new balance with the old unpaid bills (that would take them off twice).
 * paidAt is the check-in instant itself, so reconcile.paidSinceCheckIn sees them as
 * already in the balance.
 */
export function reconcileCheckIn(input: {
  balance: Cents
  date: ISODate
  at?: string
  paid: readonly PaidAtCheckIn[]
}) {
  const at = input.at ?? nowInstant()
  return mutate('Check in balance', ['checkIns', 'billOccurrences'], (w) =>
    writeCheckIn(w, { ...input, at }),
  )
}

/** The check-in writes, for callers that bundle more into the same undo step. */
export async function writeCheckIn(
  w: Writer,
  input: { balance: Cents; date: ISODate; at: string; paid: readonly PaidAtCheckIn[] },
) {
  for (const p of input.paid) {
    const id = occurrenceId(p.billId, p.originalDate)
    const existing = await w.get('billOccurrences', id)
    await w.put('billOccurrences', {
      ...paidFields(existing, p.amount, input.at, p.auto),
      id,
      billId: p.billId,
      originalDate: p.originalDate,
    })
  }
  const row: BalanceCheckIn = {
    id: newId(),
    at: input.at,
    date: input.date,
    balance: input.balance,
  }
  await w.put('checkIns', row)
  return row
}

export const latestCheckIn = () => db.checkIns.orderBy('at').last()
export const listCheckIns = () => db.checkIns.orderBy('at').toArray()

export function deleteCheckIn(id: Id) {
  return mutate('Delete check-in', ['checkIns'], (w) => w.delete('checkIns', id))
}
