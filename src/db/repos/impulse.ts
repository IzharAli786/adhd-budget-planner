import type { Id, ImpulseItem } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { NotFoundError, newId, nowInstant } from './util'

export type ImpulseDecision = NonNullable<ImpulseItem['decision']>

export const listImpulse = () => db.impulse.orderBy('addedAt').toArray()
export const listUndecidedImpulse = async () =>
  (await listImpulse()).filter((i) => i.decision === undefined)

export function addImpulse(input: Pick<ImpulseItem, 'name' | 'amount'>, addedAt = nowInstant()) {
  return mutate('Add to 48h list', ['impulse'], async (w) => {
    const item: ImpulseItem = { ...input, id: newId(), addedAt }
    await w.put('impulse', item)
    return item
  })
}

/** One undo step for a batch ("skip all three"), which is how the 48h review is used. */
export function decideImpulse(ids: Id[], decision: ImpulseDecision, decidedAt = nowInstant()) {
  return mutate(
    ids.length === 1 ? 'Decide item' : `Decide ${ids.length} items`,
    ['impulse'],
    async (w) => {
      for (const id of ids) {
        const item = await w.get('impulse', id)
        if (!item) throw new NotFoundError('impulse', id)
        await w.put('impulse', { ...item, decision, decidedAt })
      }
    },
  )
}

/** "Later": another 48 hours from now, instead of a decision made under pressure. */
export function waitAgain(ids: Id[], now = nowInstant()) {
  return mutate('Wait 48 more hours', ['impulse'], async (w) => {
    for (const id of ids) {
      const item = await w.get('impulse', id)
      if (!item) throw new NotFoundError('impulse', id)
      await w.put('impulse', { ...item, addedAt: now })
    }
  })
}

export function deleteImpulse(id: Id) {
  return mutate('Delete item', ['impulse'], (w) => w.delete('impulse', id))
}
