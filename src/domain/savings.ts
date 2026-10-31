// Savings funds (PLAN §3.3): money moved into a fund is a transaction with fundId, so the
// fund's total is derived (opening + Σ moves) and can never drift from the history.
import { daysBetween } from './dates'
import type { Cents } from './money'
import type { ISODate, SavingsFund, Transaction } from './types'

export const CHALLENGE_WEEKS = 52

/** Moves into the fund are negative (they leave the balance), so saved = −Σ amount. */
export function fundSaved(
  fund: Pick<SavingsFund, 'id' | 'openingSaved'>,
  txs: readonly Transaction[],
): Cents {
  return txs.reduce(
    (saved, t) => (t.fundId === fund.id && t.deletedAt === undefined ? saved - t.amount : saved),
    fund.openingSaved,
  )
}

/** 0..1 toward the target; 0 without one. */
export function fundProgress(saved: Cents, target: Cents | undefined): number {
  if (!target || target <= 0) return 0
  return Math.min(1, Math.max(0, saved / target))
}

/**
 * The 52-week challenge: week n puts away n units (€1, €2 … €52 = €1,378). Integers by
 * construction (PLAN §3.1): `unit` is one whole currency unit in minor units.
 */
export function challengeTotal(unit: Cents): Cents {
  return (unit * CHALLENGE_WEEKS * (CHALLENGE_WEEKS + 1)) / 2
}

/** Challenge week for today, 1..52; 0 before it starts, 52 after it ends. */
export function challengeWeek(start: ISODate, today: ISODate): number {
  const days = daysBetween(start, today)
  if (days < 0) return 0
  return Math.min(CHALLENGE_WEEKS, Math.floor(days / 7) + 1)
}

/** What this week asks for, and the running total the challenge has asked for so far. */
export function challengeStep(start: ISODate, today: ISODate, unit: Cents) {
  const week = challengeWeek(start, today)
  return { week, thisWeek: week * unit, soFar: (unit * week * (week + 1)) / 2 }
}

/**
 * "About €x per payday to reach it by <date>". Rounds UP (unlike perDay's floor): a
 * suggestion that falls a cent short every payday would never reach the target.
 * Null when there is nothing left to save; with no payday left, the whole rest.
 */
export function perPaydayToReach(remaining: Cents, paydaysLeft: number): Cents | null {
  if (remaining <= 0) return null
  return paydaysLeft <= 0 ? remaining : Math.ceil(remaining / paydaysLeft)
}

/** The payday a fund reaches its target at `perPeriod` a payday, or null if out of view. */
export function reachedOn(
  remaining: Cents,
  perPeriod: Cents,
  paydays: readonly ISODate[],
): ISODate | null {
  if (remaining <= 0 || perPeriod <= 0) return null
  return paydays[Math.ceil(remaining / perPeriod) - 1] ?? null
}
