// First-run setup storage (PLAN §5). Progress is written after every step; finishing
// creates the primary income and the first balance check-in in ONE transaction.
import { isSetupComplete, scheduleFromSetup, type SetupProgress } from '../../domain/setup'
import type { BalanceCheckIn, Cents, IncomeSource, ISODate } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { getMeta } from './meta'
import { newId, nowInstant } from './util'

export const getSetupProgress = () => getMeta<SetupProgress>('setupProgress')

export async function setupComplete(): Promise<boolean> {
  const [progress, incomes] = await Promise.all([getSetupProgress(), db.incomes.count()])
  return isSetupComplete(progress, incomes > 0)
}

/** Merges answers into the stored progress. Not undoable, like all bookkeeping. */
export function saveSetupProgress(patch: Partial<SetupProgress>) {
  return mutate(null, ['meta'], async (w) => {
    const current = (await w.get('meta', 'setupProgress'))?.value as SetupProgress | undefined
    const next: SetupProgress = { step: 'ack', ...current, ...patch }
    await w.put('meta', { key: 'setupProgress', value: next })
    return next
  })
}

export class SetupIncompleteError extends Error {
  constructor() {
    super('Setup answers are missing; the app should have asked for them first.')
    this.name = 'SetupIncompleteError'
  }
}

/**
 * Finishes setup. Idempotent: the "done" check and the writes share one read-write
 * transaction, and IndexedDB runs those one at a time, so a double tap or a retry
 * after a crash can never create a second income or check-in.
 */
export function completeSetup(balance: Cents, today: ISODate, at = nowInstant()) {
  return mutate(null, ['meta', 'incomes', 'checkIns'], async (w) => {
    const progress = (await w.get('meta', 'setupProgress'))?.value as SetupProgress | undefined
    if (progress?.step === 'done') return false
    const { nextPayday, kind, amount, otherDay } = progress ?? {}
    if (!nextPayday || !kind || amount === undefined) throw new SetupIncompleteError()

    const { schedule, weekendRule } = scheduleFromSetup(kind, nextPayday, otherDay)
    // Pay periods come from ONE primary income (PLAN §3.6).
    for (const other of await db.incomes.toArray()) {
      if (other.primary) await w.put('incomes', { ...other, primary: false })
    }
    const income: IncomeSource = {
      id: newId(),
      name: 'Pay',
      amount,
      schedule,
      weekendRule,
      primary: true,
      active: true,
    }
    await w.put('incomes', income)
    const checkIn: BalanceCheckIn = { id: newId(), at, date: today, balance }
    await w.put('checkIns', checkIn)
    await w.put('meta', { key: 'setupProgress', value: { ...progress, step: 'done', doneAt: at } })
    return true
  })
}
