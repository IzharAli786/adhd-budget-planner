// Run-to-payday (PLAN §4.2): turns safe-to-spend into "€23 for today".
// The allowance is fixed at the START of the day, so what you spend today comes out of
// today's number euro for euro instead of being spread over the days left.
import { addDays } from './dates'
import type { Cents } from './money'
import { isSpend } from './reconcile'
import type { ISODate, Transaction } from './types'

export interface Runway {
  perDay: Cents
  /** perDay minus today's spending. Can go below zero ("€4 over today"). */
  leftToday: Cents
  spentToday: Cents
  startOfDaySafe: Cents
  /** Days from today to payday, today included. Always at least 1. */
  daysLeft: number
  /** At last week's pace, does the money last until payday? */
  onTrack: boolean
}

export interface RunwayInput {
  safeToSpend: Cents
  /** What was spent today and already taken out of safeToSpend (counted transactions). */
  spentToday: Cents
  daysLeft: number
  /** Spending over the 7 days before today. */
  spentLast7Days: Cents
}

export function runway({ safeToSpend, spentToday, daysLeft, spentLast7Days }: RunwayInput): Runway {
  const days = Math.max(1, Math.floor(daysLeft))
  const startOfDaySafe = safeToSpend + spentToday
  // Rounding point (PLAN §3.1): floor, so seven days of perDay never exceed the total.
  const perDay = startOfDaySafe > 0 ? Math.floor(startOfDaySafe / days) : 0
  // safe − (spent7 / 7) × (days − 1) ≥ 0, multiplied through by 7 so nothing rounds.
  const onTrack = safeToSpend * 7 - spentLast7Days * (days - 1) >= 0
  return {
    perDay,
    leftToday: perDay - spentToday,
    spentToday,
    startOfDaySafe,
    daysLeft: days,
    onTrack,
  }
}

/** Spending dated today among the transactions that moved the balance. */
export function spentOn(counted: readonly Transaction[], date: ISODate): Cents {
  return -counted.filter((t) => t.date === date && isSpend(t)).reduce((a, t) => a + t.amount, 0)
}

/** All spending in the 7 days before today (counted or not: this is about habits). */
export function spentLast7Days(txs: readonly Transaction[], today: ISODate): Cents {
  const from = addDays(today, -7)
  return -txs
    .filter((t) => t.deletedAt === undefined && isSpend(t) && t.date >= from && t.date < today)
    .reduce((a, t) => a + t.amount, 0)
}

export interface CanFit {
  fits: boolean
  /** Safe-to-spend after buying it. */
  after: Cents
  /** The daily allowance if the purchase is spread over the days left. */
  perDayAfter: Cents
}

/** "Can this fit?": safe-to-spend and the per-day number, before and after buying x. */
export function canFit(
  x: Cents,
  { total, spentToday, daysLeft }: { total: Cents; spentToday: Cents; daysLeft: number },
): CanFit {
  const after = total - x
  const { perDay } = runway({ safeToSpend: after, spentToday, daysLeft, spentLast7Days: 0 })
  return { fits: after >= 0, after, perDayAfter: perDay }
}
