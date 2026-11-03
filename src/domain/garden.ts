// The garden (PLAN §4.5): progress that only grows. Points come from OUTCOMES (a balance
// checked, a bill paid, a day without spending, an impulse skipped), never from how many
// entries were logged, so there is nothing to farm and nothing to lose.
import { txKind } from './ledger'
import type { BillOccurrence, ImpulseItem, ISODate, NoSpendDay, Transaction } from './types'

export interface GardenOutcomes {
  checkIns: readonly { date: ISODate }[]
  occurrences: readonly Pick<BillOccurrence, 'status'>[]
  noSpend: readonly NoSpendDay[]
  impulse: readonly Pick<ImpulseItem, 'decision'>[]
  /** To tell a real no-spend day from a tap: a day with logged spending isn't one. */
  transactions: readonly SpendLike[]
}

type SpendLike = Pick<
  Transaction,
  'date' | 'amount' | 'fundId' | 'debtId' | 'billOccurrenceId' | 'adjust' | 'envelopeId' | 'deletedAt'
>

/**
 * One point per outcome. Check-ins count once per day: checking in twice isn't progress.
 * A no-spend mark counts only on a day with no spending logged, so the mark is an outcome
 * rather than a button press.
 */
export function gardenPoints(o: GardenOutcomes): number {
  const checkInDays = new Set(o.checkIns.map((c) => c.date)).size
  const billsPaid = o.occurrences.filter((x) => x.status === 'paid').length
  const spendDays = spendDates(o.transactions)
  const noSpendDays = new Set(o.noSpend.map((d) => d.date).filter((d) => !spendDays.has(d))).size
  const skipped = o.impulse.filter((i) => i.decision === 'skipped').length
  return checkInDays + billsPaid + noSpendDays + skipped
}

export const GARDEN_STAGES = [
  { from: 0, name: 'A seed' },
  { from: 3, name: 'A sprout' },
  { from: 8, name: 'A seedling' },
  { from: 16, name: 'A young plant' },
  { from: 28, name: 'First buds' },
  { from: 45, name: 'In bloom' },
] as const

export interface GardenStage {
  /** 0..GARDEN_STAGES.length − 1 */
  index: number
  name: string
  /** Points the next stage needs, or null at the last one. */
  nextAt: number | null
  /** 0..1 through the current stage (1 at the last). */
  progress: number
}

/** Monotonic: more points never give an earlier stage. */
export function gardenStage(points: number): GardenStage {
  const p = Math.max(0, Math.floor(points))
  let index = 0
  for (const [i, s] of GARDEN_STAGES.entries()) if (p >= s.from) index = i
  const stage = GARDEN_STAGES[index]!
  const next = GARDEN_STAGES[index + 1]
  return {
    index,
    name: stage.name,
    nextAt: next?.from ?? null,
    progress: next ? (p - stage.from) / (next.from - stage.from) : 1,
  }
}

/**
 * Points shown = the best ever reached. Deleting a check-in or undoing a no-spend day
 * may lower the computed count, but the garden never shrinks (PLAN §1.3), so the UI
 * keeps a high-water mark in meta.gardenPoints.
 */
export const keptPoints = (stored: number | undefined, computed: number) =>
  Math.max(stored ?? 0, computed)

/** Days with spending logged (savings moves, debt payments and corrections aren't spending). */
export function spendDates(txs: readonly SpendLike[]): Set<ISODate> {
  return new Set(
    txs.filter((t) => t.deletedAt === undefined && txKind(t) === 'expense').map((t) => t.date),
  )
}
