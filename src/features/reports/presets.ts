// The quick ranges on Reports. Every range is inclusive (the first and last day both
// count), unlike the [start, end) ranges inside the domain.
import { addDays, addMonths, lastDayOfMonth, makeDate, parseISODate } from '../../domain/dates'
import { previousPayPeriod } from '../../domain/review'
import { currentPeriod, primaryIncome } from '../../domain/paySchedule'
import type { IncomeSource, ISODate, PaydayOverride } from '../../domain/types'

export const PRESETS = [
  { value: 'thisPeriod', label: 'This pay period' },
  { value: 'lastPeriod', label: 'Last pay period' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'thisYear', label: 'This year' },
  { value: 'last12', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom' },
] as const

export type Preset = (typeof PRESETS)[number]['value']

export interface InclusiveRange {
  from: ISODate
  to: ISODate
}

const month = (date: ISODate): InclusiveRange => {
  const { year, month } = parseISODate(date)
  return { from: makeDate(year, month, 1), to: makeDate(year, month, lastDayOfMonth(year, month)) }
}

/**
 * The dates a quick range stands for. A pay period runs from its payday to the day before
 * the next one; with no pay schedule to go by, it falls back to the calendar month.
 * Null for Custom: the dates stay as they are.
 */
export function presetRange(
  preset: Preset,
  today: ISODate,
  incomes: readonly IncomeSource[],
  paydayOverrides: readonly PaydayOverride[],
): InclusiveRange | null {
  const income = primaryIncome(incomes)
  const period = income ? currentPeriod(income, today, paydayOverrides) : null
  switch (preset) {
    case 'thisPeriod':
      return period ? { from: period.start, to: addDays(period.end, -1) } : month(today)
    case 'lastPeriod': {
      const last = period && previousPayPeriod({ incomes, paydayOverrides }, period.start)
      return last
        ? { from: last.start, to: addDays(last.end, -1) }
        : month(addMonths(month(today).from, -1))
    }
    case 'thisMonth':
      return month(today)
    case 'lastMonth':
      return month(addMonths(month(today).from, -1))
    case 'thisYear': {
      const { year } = parseISODate(today)
      return { from: makeDate(year, 1, 1), to: makeDate(year, 12, 31) }
    }
    case 'last12':
      return { from: addDays(addMonths(today, -12), 1), to: today }
    case 'custom':
      return null
  }
}
