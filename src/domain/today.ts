// Everything Today shows, from raw rows and today's date. Picks the period (calendar month
// or pay period), runs the pay-based safe to spend over it and turns that into the day's
// number, in one pure function so the whole chain can be tested end to end.
import { currentPeriod, primaryIncome, type PayPeriod } from './paySchedule'
import { runway, spentLast7Days, type Runway } from './runway'
import {
  daysLeftIn,
  monthSpan,
  safeToSpend,
  type DateSpan,
  type MoneyStart,
  type PlanBy,
  type SafeToSpend,
} from './safeToSpend'
import type {
  BalanceCheckIn,
  Bill,
  BillOccurrence,
  Cents,
  Envelope,
  IncomeSource,
  ISODate,
  PaydayOverride,
  Transaction,
} from './types'
import type { BillEntry } from './bills'

export interface MoneySettings {
  planBy: PlanBy
  startingBalance: Cents
  startDate: ISODate | null
  rollover: boolean
}

/**
 * Where tracking starts. Stored once (setup, or Money basics). Installs from before v2
 * have none yet: their latest balance check-in is the natural start (PLAN-v2 decision 19).
 */
export function moneyStart(
  s: Pick<MoneySettings, 'startDate' | 'startingBalance'>,
  checkIns: readonly Pick<BalanceCheckIn, 'date' | 'balance'>[],
  today: ISODate,
): MoneyStart {
  if (s.startDate) return { date: s.startDate, balance: s.startingBalance }
  const last = checkIns.at(-1)
  if (last) return { date: last.date, balance: last.balance }
  return { date: today, balance: s.startingBalance }
}

export interface TodayInput {
  today: ISODate
  money: MoneySettings
  checkIns?: readonly Pick<BalanceCheckIn, 'date' | 'balance'>[]
  incomes: readonly IncomeSource[]
  paydayOverrides: readonly PaydayOverride[]
  bills: readonly Bill[]
  occurrences: readonly BillOccurrence[]
  transactions: readonly Transaction[]
  envelopes?: readonly Envelope[]
  envelopesEnabled?: boolean
  buffer?: number
}

export type TodayPlan =
  | { kind: 'no-income' }
  | { kind: 'no-payday' }
  | {
      kind: 'ready'
      period: PayPeriod
      start: MoneyStart
      safe: SafeToSpend
      runway: Runway
    }

/** The period containing `date`, or null in payday mode when no payday is known. */
export function periodAt(
  input: Pick<TodayInput, 'money' | 'incomes' | 'paydayOverrides'>,
  date: ISODate,
): DateSpan | null {
  if (input.money.planBy === 'month') return monthSpan(date)
  const income = primaryIncome(input.incomes)
  if (!income) return null
  const p = currentPeriod(income, date, input.paydayOverrides)
  return p && { start: p.start, end: p.end }
}

/** Safe to spend for any period (Plan's month picker, Look back), same rules as Today. */
export function moneyFor(input: TodayInput, period: DateSpan): SafeToSpend {
  return safeToSpend({
    today: input.today,
    period,
    start: moneyStart(input.money, input.checkIns ?? [], input.today),
    rollover: input.money.rollover,
    incomes: input.incomes,
    paydayOverrides: input.paydayOverrides,
    bills: input.bills,
    occurrences: input.occurrences,
    transactions: input.transactions,
    envelopes: input.envelopes,
    envelopesEnabled: input.envelopesEnabled,
    buffer: input.buffer,
  })
}

export function planToday(input: TodayInput): TodayPlan {
  const { today } = input
  if (input.money.planBy === 'payday') {
    const income = primaryIncome(input.incomes)
    if (!income) return { kind: 'no-income' }
    if (!currentPeriod(income, today, input.paydayOverrides)) return { kind: 'no-payday' }
  }
  const span = periodAt(input, today)!
  const safe = moneyFor(input, span)
  const daysLeft = daysLeftIn(span, today)
  return {
    kind: 'ready',
    period: { ...span, daysLeft },
    start: moneyStart(input.money, input.checkIns ?? [], today),
    safe,
    // The day's allowance is fixed at the start of the day (PLAN §4.2): today's spending
    // comes out of today's number. Expenses enter the total one for one, so the start of
    // the day is exactly total + spentToday.
    runway: runway({
      safeToSpend: safe.total,
      spentToday: safe.spentToday,
      daysLeft,
      spentLast7Days: spentLast7Days(input.transactions, today),
      startOfDaySafe: safe.total + safe.spentToday,
    }),
  }
}

/** Unpaid manual bills dated before today, for the "Did Rent go out?" card. */
export function overdueManual(due: readonly BillEntry[], today: ISODate): BillEntry[] {
  return due.filter((e) => !e.autopay && e.date < today)
}
