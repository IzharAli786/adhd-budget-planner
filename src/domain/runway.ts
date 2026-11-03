// Run to the end of the period (PLAN-v2 §1.4): turns safe to spend into "€118.41 for
// today". The allowance is fixed at the START of the day (S0, safe to spend before today's
// spending), so what you spend today comes out of today's number euro for euro instead of
// being spread over the days left.
import { addDays } from './dates'
import { txKind } from './ledger'
import type { Cents } from './money'
import { guardFrom, type Checkpoint, type Guard } from './pace'
import type { ISODate, Transaction } from './types'

export interface Runway {
  /** floor(S0 / daysLeft); 0 when S0 ≤ 0. */
  perDay: Cents
  /** The hero's per-day number: perDay, or the guard's when the guard binds. */
  heroPerDay: Cents
  /** heroPerDay − today's spending. Can go below zero ("€4 over today"). */
  leftToday: Cents
  spentToday: Cents
  /** S0: safe to spend with today's spending taken back out. */
  startOfDaySafe: Cents
  /** Days to the end of the period, today included. Always at least 1. */
  daysLeft: number
  /** At last week's pace, does the money last to the end of the period? */
  onTrack: boolean
}

export interface RunwayInput {
  safeToSpend: Cents
  /** Today's 'expense' rows, as a positive number (refunds and future rows excluded). */
  spentToday: Cents
  daysLeft: number
  /** Spending over the 7 days before today. */
  spentLast7Days: Cents
  /** S0. Defaults to safeToSpend + spentToday (true when every euro spent lowered S). */
  startOfDaySafe?: Cents
  /** A binding guard's per-day number (only when PACE_GUARD_BINDS). */
  guardPerDay?: Cents | null
}

export function runway({
  safeToSpend,
  spentToday,
  daysLeft,
  spentLast7Days,
  startOfDaySafe = safeToSpend + spentToday,
  guardPerDay = null,
}: RunwayInput): Runway {
  const days = Math.max(1, Math.floor(daysLeft))
  // Rounding point (PLAN §3.1): floor, so the days left never add up to more than S0.
  const perDay = startOfDaySafe > 0 ? Math.floor(startOfDaySafe / days) : 0
  const heroPerDay = guardPerDay === null ? perDay : Math.min(perDay, guardPerDay)
  // safe − (spent7 / 7) × (days − 1) ≥ 0, multiplied through by 7 so nothing rounds.
  const onTrack = safeToSpend * 7 - spentLast7Days * (days - 1) >= 0
  return {
    perDay,
    heroPerDay,
    leftToday: heroPerDay - spentToday,
    spentToday,
    startOfDaySafe,
    daysLeft: days,
    onTrack,
  }
}

const isExpense = (t: Transaction) => t.deletedAt === undefined && txKind(t) === 'expense'

/** Spending dated on `date` ('expense' rows only: refunds, savings, debt left out). */
export function spentOn(txs: readonly Transaction[], date: ISODate): Cents {
  return -txs.filter((t) => t.date === date && isExpense(t)).reduce((a, t) => a + t.amount, 0)
}

/** All spending in the 7 days before today. */
export function spentLast7Days(txs: readonly Transaction[], today: ISODate): Cents {
  const from = addDays(today, -7)
  return -txs
    .filter((t) => isExpense(t) && t.date >= from && t.date < today)
    .reduce((a, t) => a + t.amount, 0)
}

export interface CanFit {
  fits: boolean
  /** Safe to spend after buying it. */
  after: Cents
  /** The daily allowance if the purchase is spread over the days left. */
  perDayAfter: Cents
  /** The guard after buying it, when it would have something to say. */
  guardAfter: Guard | null
}

export interface CanFitInput {
  total: Cents
  daysLeft: number
  /** Runway.startOfDaySafe; the purchase comes off this before it is spread over the days. */
  startOfDaySafe: Cents
  /**
   * What is still free in the envelope it would come from (EnvelopeUsage.reserved). That
   * part is already set aside, so only the rest comes off safe to spend.
   */
  room?: Cents
  /** Today's pace checkpoints: the cost comes off each one too (§1.4). */
  checkpoints?: readonly Checkpoint[]
}

/** "Can this fit?": the same rule as the hero and the guard line, before and after buying x. */
export function canFit(
  x: Cents,
  { total, daysLeft, startOfDaySafe, room = 0, checkpoints = [] }: CanFitInput,
): CanFit {
  const cost = Math.max(0, x - Math.max(0, room))
  const after = total - cost
  const { perDay } = runway({
    safeToSpend: after,
    spentToday: 0,
    daysLeft,
    spentLast7Days: 0,
    startOfDaySafe: startOfDaySafe - cost,
  })
  const moved = checkpoints.map((c) => ({ ...c, money: c.money - cost }))
  return { fits: after >= 0, after, perDayAfter: perDay, guardAfter: guardFrom(moved, perDay) }
}
