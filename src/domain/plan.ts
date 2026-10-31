// Plan's "Income this period" line (PLAN §5).
import type { PaydayEntry } from './bills'
import type { Cents } from './money'
import type { ISODate } from './types'

export interface PeriodIncome {
  /** 'expected': nothing has come in since Steady started, so show the next pay instead. */
  kind: 'received' | 'expected'
  entries: PaydayEntry[]
  total: Cents
}

/**
 * Paydays dated before the person started (their first balance) are already inside that
 * balance and were never entered here, so listing "Salary · 30 Oct" in the first period
 * reads as a payment Steady made up. Those are dropped; if none are left, the line shows
 * the pay that is coming next instead.
 */
export function periodIncome(
  inPeriod: readonly PaydayEntry[],
  next: readonly PaydayEntry[],
  trackedSince: ISODate | undefined,
): PeriodIncome {
  const kept = trackedSince ? inPeriod.filter((p) => p.date >= trackedSince) : [...inPeriod]
  const expected = kept.length === 0 && next.length > 0
  const entries = expected ? [...next] : kept
  return {
    kind: expected ? 'expected' : 'received',
    entries,
    total: entries.reduce((a, p) => a + p.amount, 0),
  }
}
