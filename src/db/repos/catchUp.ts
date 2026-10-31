// Fresh-start catch-up (PLAN §4.5): one balance, the past bills settled, waited-out 48h
// items archived, all in ONE undo step so "Undo" puts the whole gap back as it was.
import type { Cents, Id, ISODate } from '../../domain/types'
import { mutate } from '../undo'
import { writeCheckIn, type PaidAtCheckIn } from './checkIns'
import { nowInstant } from './util'

export function applyFreshStart(input: {
  balance: Cents
  date: ISODate
  paid: readonly PaidAtCheckIn[]
  archive: readonly Id[]
  at?: string
}) {
  const at = input.at ?? nowInstant()
  return mutate('Catch up', ['checkIns', 'billOccurrences', 'impulse'], async (w) => {
    for (const id of input.archive) {
      const item = await w.get('impulse', id)
      // Only undecided items: one decided (or deleted) on another tab meanwhile is left be.
      if (item && item.decision === undefined)
        await w.put('impulse', { ...item, decision: 'archived', decidedAt: at })
    }
    return writeCheckIn(w, { balance: input.balance, date: input.date, at, paid: input.paid })
  })
}
