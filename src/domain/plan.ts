// The money settings (PLAN-v2 §2.1), stored as their own exported meta key `plan`. Kept
// apart from the appearance settings so an undo of a starting-balance change never
// reverts a later theme change (decision 3, R10).
import type { Cents } from './money'
import type { Instant, ISODate } from './types'

/** How money is divided: by calendar month (the default) or by pay period. */
export type PlanBy = 'month' | 'payday'

export interface PlanSettings {
  /** New installs: 'month' (locked decision B). */
  planBy: PlanBy
  /** The day tracking starts; null = not set yet ('no-start' on Today). */
  startDate: ISODate | null
  /**
   * The instant of local midnight at the start of `startDate`, fixed when the start is
   * set (R11). owedAtStart compares instants, so travelling never changes the number.
   */
  startAt: Instant | null
  /** B: the money at the START of startDate. Signed (an overdrawn account is allowed). */
  startingBalance: Cents
  /** Carry what's left (or what ran over) into the next period. */
  rollover: boolean
  /** The cushion kept aside from safe to spend. Non-negative. */
  buffer: Cents
  startSource: 'user' | 'migrated-latest' | 'migrated-first' | null
  /** Exported, so the update intro survives a restore (R15). */
  introPending?: true
  /** The numbers on the update day, for the intro sheet (R1). */
  legacy?: LegacySnapshot
}

export interface LegacySnapshot {
  asOf: ISODate
  /** The v4 engine on the update day. */
  before: { safe: Cents; perDay: Cents }
  /** The v5 engine, same day, same start. */
  after: { safe: Cents; perDay: Cents }
  /** Add up to after.safe − before.safe exactly. */
  reasons: { id: LegacyReasonId; amount: Cents }[]
}

export type LegacyReasonId = 'pay' | 'savings' | 'debt' | 'bills' | 'other'

/** A new install before setup: month mode, roll over on, no start yet. */
export const DEFAULT_PLAN: PlanSettings = {
  planBy: 'month',
  startDate: null,
  startAt: null,
  startingBalance: 0,
  rollover: true,
  buffer: 0,
  startSource: null,
}

/** Fills missing fields so a row written by an older build still reads as a full plan. */
export function planWithDefaults(partial: Partial<PlanSettings> | undefined): PlanSettings {
  return { ...DEFAULT_PLAN, ...partial }
}
