// Life goals (Goals, Full mode): free-form, one undo step per change. Deleting is a real
// delete, not a soft one: the undo toast brings it back, and a goal holds no money, so
// there is no history to keep for "Recently deleted".
import {
  LIFE_GOAL_TITLE_MAX,
  LIFE_GOAL_WHY_MAX,
  type Id,
  type LifeGoal,
  type LifeGoalStatus,
} from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { NotFoundError, newId, nowInstant } from './util'

export type LifeGoalInput = Pick<LifeGoal, 'title' | 'status'> &
  Partial<Pick<LifeGoal, 'why' | 'targetDate' | 'fundId' | 'debtId'>>

/** Oldest first: the order they were written down in. */
export const listLifeGoals = async () =>
  (await db.lifeGoals.toArray()).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))

// Trimmed and capped like a note; empty optional fields are left off the row entirely,
// so a backup never carries `why: ""`.
function clean(input: LifeGoalInput): LifeGoalInput {
  const why = input.why?.trim().slice(0, LIFE_GOAL_WHY_MAX)
  return {
    title: input.title.trim().slice(0, LIFE_GOAL_TITLE_MAX),
    status: input.status,
    ...(why ? { why } : {}),
    ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    ...(input.fundId ? { fundId: input.fundId } : {}),
    ...(input.debtId ? { debtId: input.debtId } : {}),
  }
}

const doneStamp = (status: LifeGoalStatus, before?: LifeGoal) =>
  status !== 'done'
    ? {}
    : { doneAt: before?.status === 'done' && before.doneAt ? before.doneAt : nowInstant() }

export function addLifeGoal(input: LifeGoalInput) {
  const row = clean(input)
  if (!row.title) throw new Error('A life goal needs a title')
  return mutate(`Add ${row.title}`, ['lifeGoals'], async (w) => {
    const goal: LifeGoal = {
      ...row,
      id: newId(),
      createdAt: nowInstant(),
      ...doneStamp(row.status),
    }
    await w.put('lifeGoals', goal)
    return goal
  })
}

/** Replaces the editable fields; id and createdAt stay. */
export function updateLifeGoal(id: Id, input: LifeGoalInput) {
  const row = clean(input)
  if (!row.title) throw new Error('A life goal needs a title')
  return mutate(`Edit ${row.title}`, ['lifeGoals'], async (w) => {
    const before = await w.get('lifeGoals', id)
    if (!before) throw new NotFoundError('lifeGoals', id)
    const goal: LifeGoal = {
      ...row,
      id,
      createdAt: before.createdAt,
      ...doneStamp(row.status, before),
    }
    await w.put('lifeGoals', goal)
    return goal
  })
}

export function setLifeGoalStatus(id: Id, status: LifeGoalStatus) {
  return mutate('Change goal status', ['lifeGoals'], async (w) => {
    const before = await w.get('lifeGoals', id)
    if (!before) throw new NotFoundError('lifeGoals', id)
    const goal: LifeGoal = { ...before, status, ...doneStamp(status, before) }
    if (status !== 'done') delete goal.doneAt
    await w.put('lifeGoals', goal)
    return goal
  })
}

export function deleteLifeGoal(id: Id) {
  return mutate('Delete life goal', ['lifeGoals'], async (w) => {
    await w.delete('lifeGoals', id)
  })
}
