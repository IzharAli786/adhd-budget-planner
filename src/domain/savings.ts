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

export type FundPace =
  | { kind: 'reached' }
  /** "About `perPayday` per payday to reach it by `by`". */
  | { kind: 'by-date'; perPayday: Cents; by: ISODate }
  /** "At `perPeriod` a payday, you'll get there around `when`". */
  | { kind: 'eta'; when: ISODate }

/**
 * The one pace line for a fund, shared by Goals and Plan so they never disagree. A target
 * date still ahead wins (that is what the person asked for); otherwise the fund's own
 * per-payday amount gives an estimate. Null without a target, or with no estimate in view.
 */
export function fundPace(
  fund: Pick<SavingsFund, 'target' | 'targetDate' | 'perPeriod'>,
  saved: Cents,
  today: ISODate,
  paydays: readonly ISODate[],
): FundPace | null {
  if (fund.target === undefined) return null
  const remaining = fund.target - saved
  if (remaining <= 0) return { kind: 'reached' }
  if (fund.targetDate && fund.targetDate >= today) {
    const by = fund.targetDate
    const left = paydays.filter((d) => d >= today && d <= by).length
    return { kind: 'by-date', perPayday: perPaydayToReach(remaining, left)!, by }
  }
  const when = reachedOn(remaining, fund.perPeriod, paydays)
  return when ? { kind: 'eta', when } : null
}

export interface SavingsTotals {
  saved: Cents
  /** Sum of the funds that have a target; 0 when none do. */
  target: Cents
  /** 0..1 across the funds with a target. */
  progress: number
}

/**
 * The three tiles above the funds. Progress counts each fund only up to its own target,
 * so one overfilled fund can't make the others look done; funds with no target add to
 * "saved" but not to the progress.
 */
export function savingsTotals(
  funds: readonly Pick<SavingsFund, 'id' | 'openingSaved' | 'target'>[],
  txs: readonly Transaction[],
): SavingsTotals {
  let saved = 0
  let target = 0
  let towards = 0
  for (const fund of funds) {
    const s = fundSaved(fund, txs)
    saved += s
    if (fund.target && fund.target > 0) {
      target += fund.target
      towards += Math.min(Math.max(s, 0), fund.target)
    }
  }
  return { saved, target, progress: target > 0 ? towards / target : 0 }
}
