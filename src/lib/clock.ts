import type { ISODate } from '../domain/types'
import { formatISODate } from '../domain/dates'

// "Today" must come from LOCAL date parts. toISOString() is UTC, so just after midnight
// in CET it still reports yesterday's date.
export function todayISO(now: Date = new Date()): ISODate {
  return formatISODate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() })
}

/** Milliseconds until the next local midnight, for scheduling a "day changed" refresh. */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return next.getTime() - now.getTime()
}
