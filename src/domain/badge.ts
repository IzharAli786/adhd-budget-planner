// The number on the home-screen icon (PLAN §6 reminders): bills due within 2 days plus
// waited-out 48h items. Small on purpose: a badge that always says 9 gets ignored.
import type { BillEntry } from './bills'
import { addDays } from './dates'
import { expiredImpulse } from './impulse'
import type { ImpulseItem, Instant, ISODate } from './types'

export const BADGE_DAYS = 2

export interface BadgeInput {
  /** Bill entries from at least the last check-in to today + BADGE_DAYS. */
  entries: readonly BillEntry[]
  impulse: readonly ImpulseItem[]
  today: ISODate
  now: Instant
}

export function badgeCount({ entries, impulse, today, now }: BadgeInput): number {
  const until = addDays(today, BADGE_DAYS)
  const bills = entries.filter(
    (e) =>
      e.status === 'due' &&
      e.date <= until &&
      // A past autopay bill has most likely gone out; the next check-in confirms it.
      // A past manual one still needs a "did it go out?", so it keeps counting.
      (e.date >= today || !e.autopay),
  ).length
  return bills + expiredImpulse(impulse, now).length
}
