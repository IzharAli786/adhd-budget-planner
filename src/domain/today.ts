// Everything Today shows, from raw rows and today's date. Composes the period, the
// reconciliation, safe-to-spend and the runway in one pure function, so the screen stays
// a thin view and the whole chain can be property-tested end to end.
import { currentPeriod, previousPayday, primaryIncome, type PayPeriod } from './paySchedule'
import { isSpend, lookbackStart, paydaySinceCheckIn, type CheckInLike } from './reconcile'
import { runway, spentLast7Days, spentOn, type Runway } from './runway'
import { safeToSpend, type SafeToSpend } from './safeToSpend'
import type {
  Bill,
  BillOccurrence,
  Envelope,
  Id,
  IncomeSource,
  ISODate,
  PaydayOverride,
  SavingsFund,
  Transaction,
} from './types'
import type { BillEntry } from './bills'

export interface TodayInput {
  today: ISODate
  incomes: readonly IncomeSource[]
  paydayOverrides: readonly PaydayOverride[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  transactions: readonly Transaction[]
  checkIn: CheckInLike | undefined
  funds?: readonly SavingsFund[]
  envelopes?: readonly Envelope[]
  envelopesEnabled?: boolean
  buffer?: number
  addedOn?: ReadonlyMap<Id, ISODate>
}

export type TodayPlan =
  | { kind: 'no-income' }
  | { kind: 'no-payday' }
  /** Has a period but no balance yet. `due` feeds the first check-in. */
  | { kind: 'no-balance'; period: PayPeriod; due: BillEntry[] }
  | {
      kind: 'ready'
      period: PayPeriod
      lookback: ISODate
      safe: SafeToSpend
      runway: Runway
      paydaySinceCheckIn: boolean
    }

export function planToday(input: TodayInput): TodayPlan {
  const { today, incomes, paydayOverrides, checkIn } = input
  const income = primaryIncome(incomes)
  if (!income) return { kind: 'no-income' }
  const period = currentPeriod(income, today, paydayOverrides)
  if (!period) return { kind: 'no-payday' }

  // Before the first check-in, "since the last check-in" means since this period began.
  const anchor: CheckInLike = checkIn ?? { at: '', date: today, balance: 0 }
  const lookback = lookbackStart(
    anchor.date,
    checkIn ? previousPayday(income, checkIn.date, paydayOverrides) : period.start,
  )
  const safeWith = (transactions: readonly Transaction[]) =>
    safeToSpend({
      today,
      period,
      checkIn: anchor,
      lookback,
      transactions,
      bills: input.bills,
      occurrences: input.occurrences,
      funds: input.funds,
      envelopes: input.envelopes,
      envelopesEnabled: input.envelopesEnabled,
      buffer: input.buffer,
      addedOn: input.addedOn,
    })
  const safe = safeWith(input.transactions)
  if (!checkIn) return { kind: 'no-balance', period, due: safe.dueEntries }

  // The day's allowance is fixed at the start of the day (PLAN §4.2): safe-to-spend as it
  // was before today's spending. Recomputed rather than "safe + spentToday", because with
  // envelopes on, money spent inside an envelope's room never lowered safe-to-spend.
  const spentTodayRows = new Set(safe.counted.filter((t) => t.date === today && isSpend(t)))
  const startOfDaySafe =
    spentTodayRows.size === 0
      ? safe.total
      : safeWith(input.transactions.filter((t) => !spentTodayRows.has(t))).total

  return {
    kind: 'ready',
    period,
    lookback,
    safe,
    runway: runway({
      safeToSpend: safe.total,
      spentToday: spentOn(safe.counted, today),
      daysLeft: period.daysLeft,
      spentLast7Days: spentLast7Days(input.transactions, today),
      startOfDaySafe,
    }),
    paydaySinceCheckIn: paydaySinceCheckIn(period.start, checkIn.date),
  }
}

/** Unpaid manual bills dated before today, for the "Did Rent go out?" card. */
export function overdueManual(due: readonly BillEntry[], today: ISODate): BillEntry[] {
  return due.filter((e) => !e.autopay && e.date < today)
}
