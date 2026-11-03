// Everything Today shows, from raw rows and today's date (PLAN-v2 §1.4, §4.1). Composes
// the period, the period plan, the pace guard and the runway in one pure function, so the
// screen stays a thin view and the whole chain is property-tested end to end.
import type { PaydayLine } from './bills'
import { addDays } from './dates'
import { paydaysBetweenDates, periodContext, planFor, planWith, txKind } from './ledger'
import type { LedgerInput, PeriodPlan } from './ledger'
import type { Cents } from './money'
import {
  accountEstimate,
  guardFrom,
  paceCheckpoints,
  PACE_GUARD_BINDS,
  type Checkpoint,
  type Guard,
} from './pace'
import { daysLeft, periodAt, type Period } from './period'
import { runway, spentLast7Days, spentOn, type Runway } from './runway'

export type TodayPlan =
  /** No starting balance yet: Today asks "What's in your account right now?". */
  | { kind: 'no-start' }
  /** Payday mode with no next payday: "When is your next pay?". */
  | { kind: 'no-payday' }
  | {
      kind: 'ready'
      period: Period
      plan: PeriodPlan
      runway: Runway
      /** Advice under the hero; binds only when PACE_GUARD_BINDS. */
      guard: Guard | null
      /** For "Can this fit?" (runway.canFit) and the math sheet's "Before your pay". */
      checkpoints: Checkpoint[]
      /** The next pay on the primary chain (any income when there is none), not skipped. */
      nextPayday: PaydayLine | null
      /** What the account should hold now (pace.accountEstimate). */
      accountEstimate: Cents
    }

export interface TodayOptions {
  /** Defaults to PACE_GUARD_BINDS; tests flip it to check I7 both ways. */
  guardBinds?: boolean
}

export function planToday(input: LedgerInput, opts: TodayOptions = {}): TodayPlan {
  const { today } = input
  if (input.plan.startDate === null) return { kind: 'no-start' }
  const period = periodAt(today, periodContext(input))
  if (period === null) return { kind: 'no-payday' }

  const plan = planFor(period, input)
  // The day's allowance is fixed at the start of the day: S0 is S without today's
  // 'expense' rows. Recomputed, not "S + spent", because spending inside an envelope's
  // room never lowered S in the first place.
  const todays = new Set(
    input.transactions
      .filter((t) => t.date === today && t.deletedAt === undefined && txKind(t) === 'expense')
      .map((t) => t.id),
  )
  const plan0 = todays.size === 0 ? plan : planWith(period, input, todays)
  const safe = plan.safe ?? 0
  const s0 = plan0.safe ?? 0
  const days = daysLeft(period, today)
  const perDay = s0 > 0 ? Math.floor(s0 / days) : 0

  const checkpoints = paceCheckpoints(input, period, plan0.reserved)
  const guard = guardFrom(checkpoints, perDay)
  const binds = opts.guardBinds ?? PACE_GUARD_BINDS

  return {
    kind: 'ready',
    period,
    plan,
    runway: runway({
      safeToSpend: safe,
      startOfDaySafe: s0,
      spentToday: spentOn(input.transactions, today),
      daysLeft: days,
      spentLast7Days: spentLast7Days(input.transactions, today),
      guardPerDay: binds && guard ? guard.perDay : null,
    }),
    guard,
    checkpoints,
    nextPayday: upcomingPay(input),
    accountEstimate: accountEstimate(input) ?? 0,
  }
}

/** The first payday after today that isn't skipped: the primary chain's, else any. */
function upcomingPay(input: LedgerInput): PaydayLine | null {
  const from = addDays(input.today, 1)
  const ahead = paydaysBetweenDates(input, from, addDays(from, 400)).filter((p) => !p.skipped)
  return ahead.find((p) => p.primary) ?? ahead[0] ?? null
}
