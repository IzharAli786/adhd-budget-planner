import type { BalanceCheckIn, Cents, Id, ISODate } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { newId, nowInstant } from './util'

export function addCheckIn(balance: Cents, date: ISODate, at = nowInstant()) {
  return mutate('Check in balance', ['checkIns'], async (w) => {
    const row: BalanceCheckIn = { id: newId(), at, date, balance }
    await w.put('checkIns', row)
    return row
  })
}

export const latestCheckIn = () => db.checkIns.orderBy('at').last()
export const listCheckIns = () => db.checkIns.orderBy('at').toArray()

export function deleteCheckIn(id: Id) {
  return mutate('Delete check-in', ['checkIns'], (w) => w.delete('checkIns', id))
}
