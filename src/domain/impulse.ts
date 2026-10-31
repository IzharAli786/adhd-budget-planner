// The 48-hour list (PLAN §4.5): write the thing down, wait two days, then decide. Pure:
// `now` is always passed in, so tests can stand at hour 47 and hour 48 exactly.
import type { Cents } from './money'
import type { ImpulseItem, Instant } from './types'

export const WAIT_HOURS = 48
const HOUR = 3_600_000

export type ImpulseState = 'waiting' | 'ready' | 'decided'

/** The instant the wait is over. */
export function readyAt(item: Pick<ImpulseItem, 'addedAt'>): Instant {
  return new Date(Date.parse(item.addedAt) + WAIT_HOURS * HOUR).toISOString()
}

export function msLeft(item: Pick<ImpulseItem, 'addedAt'>, now: Instant): number {
  return Math.max(0, Date.parse(readyAt(item)) - Date.parse(now))
}

export function impulseState(item: ImpulseItem, now: Instant): ImpulseState {
  if (item.decision !== undefined) return 'decided'
  return msLeft(item, now) === 0 ? 'ready' : 'waiting'
}

/** Items whose 48 hours are up and still need a "Still want it?" answer. */
export const readyItems = (items: readonly ImpulseItem[], now: Instant) =>
  items.filter((i) => impulseState(i, now) === 'ready')

export const waitingItems = (items: readonly ImpulseItem[], now: Instant) =>
  items.filter((i) => impulseState(i, now) === 'waiting')

/** "Saved by waiting": everything you decided to skip. */
export function savedByWaiting(items: readonly ImpulseItem[]): Cents {
  return items.reduce((a, i) => (i.decision === 'skipped' ? a + i.amount : a), 0)
}

/** "1 d 5 h left", "3 h left", "under an hour left". */
export function countdownLabel(ms: number): string {
  const hours = Math.floor(ms / HOUR)
  if (hours < 1) return 'under an hour left'
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  if (days === 0) return `${hours} h left`
  return rest === 0 ? `${days} ${days === 1 ? 'day' : 'days'} left` : `${days} d ${rest} h left`
}

/** Undecided and waited out: ready for "Still want it?". */
export const isImpulseExpired = (item: ImpulseItem, now: Instant) =>
  impulseState(item, now) === 'ready'

export const expiredImpulse = readyItems
