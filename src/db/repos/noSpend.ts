import type { ISODate } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'

export const listNoSpend = () => db.noSpend.orderBy('date').toArray()
export const isNoSpend = async (date: ISODate) => (await db.noSpend.get(date)) !== undefined

/** Flips a day on or off. Returns the new state. */
export function toggleNoSpend(date: ISODate) {
  return mutate('Toggle no-spend day', ['noSpend'], async (w) => {
    const on = (await w.get('noSpend', date)) !== undefined
    if (on) await w.delete('noSpend', date)
    else await w.put('noSpend', { date })
    return !on
  })
}
