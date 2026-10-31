// The 48-hour list (PLAN §1): park a want, decide once the wait is over. Pure: `now` is
// passed in, so expiry is testable without a clock.
import type { ImpulseItem, Instant } from './types'

export const IMPULSE_WAIT_HOURS = 48

/** Undecided and waited out: ready for "Still want it?". */
export function isImpulseExpired(item: ImpulseItem, now: Instant): boolean {
  return (
    item.decision === undefined &&
    Date.parse(item.addedAt) + IMPULSE_WAIT_HOURS * 3_600_000 <= Date.parse(now)
  )
}

export const expiredImpulse = (items: readonly ImpulseItem[], now: Instant) =>
  items.filter((i) => isImpulseExpired(i, now))
