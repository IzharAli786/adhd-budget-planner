import { missingStarters } from '../../domain/categories'
import type { Envelope, Id } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { softRepo } from './softRepo'
import { newId } from './util'

const repo = softRepo<Envelope>('envelopes', 'envelope')

export const getEnvelope = repo.get
export const updateEnvelope = repo.update
export const restoreEnvelope = repo.restore
export const listDeletedEnvelopes = repo.listDeleted

export async function listEnvelopes() {
  return (await repo.list()).sort((a, b) => a.sort - b.sort)
}

export async function addEnvelope(input: Omit<Envelope, 'id' | 'sort' | 'isDefault'>) {
  const last = await db.envelopes.orderBy('sort').last()
  return repo.add({ ...input, isDefault: false, sort: (last?.sort ?? -1) + 1 })
}

/** The default "Everyday" envelope catches everything unassigned, so it cannot go away. */
export async function deleteEnvelope(id: Id) {
  const env = await repo.get(id)
  if (env?.isDefault) throw new Error('The default envelope cannot be deleted')
  return repo.remove(id)
}

/** Creates "Everyday" once. Not undoable: it is setup, not a user action. */
export function ensureDefaultEnvelope(name = 'Everyday') {
  return mutate(null, ['envelopes'], async (w) => {
    const existing = (await db.envelopes.toArray()).find((e) => e.isDefault && !e.deletedAt)
    if (existing) return existing
    const env: Envelope = {
      id: newId(),
      name,
      budget: 0,
      isDefault: true,
      color: 'accent',
      sort: 0,
    }
    await w.put('envelopes', env)
    return env
  })
}

/**
 * "Start with common categories": the starter set with empty budgets, after what's there,
 * in one undo step. Names that already exist are skipped. Returns how many were added.
 */
export function addStarterEnvelopes() {
  return mutate('Add common categories', ['envelopes'], async (w) => {
    const all = await db.envelopes.toArray()
    let sort = Math.max(-1, ...all.map((e) => e.sort))
    const add = missingStarters(all)
    for (const c of add) {
      sort += 1
      await w.put('envelopes', {
        id: newId(),
        name: c.name,
        budget: 0,
        isDefault: false,
        color: c.color,
        sort,
      })
    }
    return add.length
  })
}

/** Rewrites sort to match the given order in one undo step. */
export function reorderEnvelopes(ids: Id[]) {
  return mutate('Reorder envelopes', ['envelopes'], async (w) => {
    for (const [sort, id] of ids.entries()) {
      const env = await repo.load(w, id)
      if (env.sort !== sort) await w.put('envelopes', { ...env, sort })
    }
  })
}
