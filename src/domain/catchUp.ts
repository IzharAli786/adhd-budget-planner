// Coming back after time away (PLAN §4.5). Pure: the caller passes the last day the app
// was open, today, and what safe-to-spend currently counts.
//
// Short gap (7 days or less): one summary card with counts.
// Fresh start (more than 7 days, PLAN-v2 §3): no balance question. Past manual bills can
// be marked paid in one go (bookkeeping: under accrual that never moves the number;
// autopay ones already read as paid), waited-out 48h items are archived, and the screen
// offers an optional correction or "Start fresh from today". No transactions invented.
import { effectiveStatus, type BillEntry } from './bills'
import { daysBetween } from './dates'
import { expiredImpulse } from './impulse'
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
  /** Past manual bills still unpaid: "Mark all paid", minus the exceptions the user picks. */
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
    return {
      mode: 'fresh',
      daysAway,
      ask: settlePastBills(input.due, today),
      archive: expired.map((i) => i.id),
    }
  }

  const billsCameDue = input.due.filter(
    (e) => effectiveStatus(e, today) === 'due' && e.date > lastOpened && e.date <= today,
  ).length
  const paydayPassed = input.periodStart > lastOpened && input.periodStart <= today
  if (billsCameDue === 0 && !paydayPassed && expired.length === 0) return NONE
  return { mode: 'short', daysAway, billsCameDue, paydayPassed, expiredImpulse: expired.length }
}

/**
 * Bills dated on or before today that still read as unpaid (manual ones: autopay ones
 * already read as paid, decision 25). Marking them paid is bookkeeping: S never moves.
 */
export function settlePastBills(entries: readonly BillEntry[], today: ISODate): BillEntry[] {
  return entries.filter((e) => e.date <= today && effectiveStatus(e, today) === 'due')
}
