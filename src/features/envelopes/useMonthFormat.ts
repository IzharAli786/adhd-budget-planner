import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { parseISODate } from '../../domain/dates'
import { dateTimeFormat } from '../../domain/intl'
import type { ISODate } from '../../domain/types'
import type { MonthTab } from './MonthTabs'

const pad = (n: number) => String(n).padStart(2, '0')

/** The twelve months of `year` as tabs, named in the app's locale. */
export function monthTabs(locale: string, year: number): MonthTab[] {
  const short = dateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
  const long = dateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
  return Array.from({ length: 12 }, (_, i) => {
    const at = new Date(Date.UTC(year, i, 1))
    return { key: `${year}-${pad(i + 1)}`, short: short.format(at), long: long.format(at) }
  })
}

/**
 * Month names for the tabs and a short row date ("6 Nov", or "06/11" with the numbers date
 * style): rows sit under a month already, so the weekday would only be noise.
 */
export function useMonthFormat(year: number) {
  const { locale, dateStyle } = useAppSettings().settings
  return useMemo(() => {
    const row = dateTimeFormat(locale, {
      timeZone: 'UTC',
      ...(dateStyle === 'numbers'
        ? { day: '2-digit', month: '2-digit' }
        : { day: 'numeric', month: 'short' }),
    })
    return {
      months: monthTabs(locale, year),
      rowDay: (date: ISODate) => {
        const { year: y, month, day } = parseISODate(date)
        return row.format(new Date(Date.UTC(y, month - 1, day)))
      },
    }
  }, [locale, dateStyle, year])
}
