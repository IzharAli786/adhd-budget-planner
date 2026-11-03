import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { useBillOccurrences, useBills, useIncomes, usePaydayOverrides } from '../../db/hooks'
import { addDays } from '../../domain/dates'
import { calendarMonthPeriod, currentPeriod, primaryIncome } from '../../domain/paySchedule'
import type { ISODate } from '../../domain/types'

export interface BillsPeriod {
  start: ISODate
  end: ISODate
  /** False when there is no payday to anchor on, so a calendar month stands in. */
  fromPayday: boolean
}

/**
 * Everything the Bills tab reads, plus the current period. Raw rows come from
 * useLiveQuery; the expansion into dated entries happens in the views, per range.
 */
export function useBillsData(today: ISODate) {
  const bills = useBills()
  const occurrences = useBillOccurrences()
  const incomes = useIncomes()
  const paydayOverrides = usePaydayOverrides()
  const { planBy } = useAppSettings().settings

  const period = useMemo<BillsPeriod>(() => {
    // Same period as safe to spend: the calendar month unless planning by payday.
    const primary = planBy === 'payday' && incomes ? primaryIncome(incomes) : undefined
    const p = primary ? currentPeriod(primary, today, paydayOverrides ?? []) : null
    if (p) return { start: p.start, end: p.end, fromPayday: true }
    const month = calendarMonthPeriod(today)
    return { start: month.start, end: month.end, fromPayday: false }
  }, [planBy, incomes, paydayOverrides, today])

  const loaded =
    bills !== undefined &&
    occurrences !== undefined &&
    incomes !== undefined &&
    paydayOverrides !== undefined

  return {
    loaded,
    bills: bills ?? [],
    occurrences: occurrences ?? [],
    incomes: incomes ?? [],
    paydayOverrides: paydayOverrides ?? [],
    period,
    /** The "Later" group runs a month past the period. */
    laterEnd: addDays(period.end, 31),
  }
}

export type BillsData = ReturnType<typeof useBillsData>
