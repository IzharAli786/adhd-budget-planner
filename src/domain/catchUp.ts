// Coming back after time away (PLAN §4.5). Pure: the caller passes the last day the app
// was open, today, and what safe-to-spend currently counts.
//
// Short gap (7 days or less): one summary card with counts.
// Fresh start (more than 7 days): one balance replaces the whole gap. Reconstructing
// three weeks of spending would be a chore nobody finishes, and the bank balance already
// contains all of it, so no transactions are invented.
import type { BillEntry } from './bills'
import { daysBetween } from './dates'
import { expiredImpulse } from './impulse'
import { checkInPlan } from './reconcile'
import type { Id, ImpulseItem, Instant, ISODate } from './types'

export const SHORT_GAP_MAX_DAYS = 7
/** Opening the app yesterday is not "away": the action card covers a single day. */
export const SHORT_GAP_MIN_DAYS = 2

export interface CatchUpInput {
  /** Local date the app was last open; null on the very first open. */
  lastOpened: ISODate | null
  today: ISODate
  /** Unpaid entries safe-to-spend counts right now (its dueEntries). */
  due: readonly BillEntry[]
  /** Start of the current pay period, to tell whether a payday fell in the gap. */
  periodStart: ISODate
  impulse: readonly ImpulseItem[]
  now: Instant
}

export interface ShortGap {
  mode: 'short'
  daysAway: number
  /** Unpaid bills whose date fell inside the gap. */
  billsCameDue: number
  paydayPassed: boolean
  expiredImpulse: number
}

export interface FreshStart {
  mode: 'fresh'
  daysAway: number
  /** Past autopay bills: the new balance already has them, so they are marked paid. */
  autoPaid: BillEntry[]
  /** Past manual bills: "Mark all paid", minus the exceptions the user picks. */
  ask: BillEntry[]
  /** Waited-out 48h items, archived quietly (never decided for the user). */
  archive: Id[]
}

export type CatchUp = { mode: 'none' } | ShortGap | FreshStart

const NONE: CatchUp = { mode: 'none' }

export function catchUp(input: CatchUpInput): CatchUp {
  const { lastOpened, today } = input
  if (lastOpened === null) return NONE
  const daysAway = daysBetween(lastOpened, today)
  // Negative after a clock change or a restore from another device: nothing to catch up.
  if (daysAway < SHORT_GAP_MIN_DAYS) return NONE

  const expired = expiredImpulse(input.impulse, input.now)

  if (daysAway > SHORT_GAP_MAX_DAYS) {
    const plan = checkInPlan(input.due, today)
    return {
      mode: 'fresh',
      daysAway,
      autoPaid: plan.autoPaid,
      ask: plan.ask,
      archive: expired.map((i) => i.id),
    }
  }

  const billsCameDue = input.due.filter(
    (e) => e.status === 'due' && e.date > lastOpened && e.date <= today,
  ).length
  const paydayPassed = input.periodStart > lastOpened && input.periodStart <= today
  if (billsCameDue === 0 && !paydayPassed && expired.length === 0) return NONE
  return { mode: 'short', daysAway, billsCameDue, paydayPassed, expiredImpulse: expired.length }
}
