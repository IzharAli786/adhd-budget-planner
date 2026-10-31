import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { daysBetween, parseISODate } from '../../domain/dates'
import {
  currencySymbol,
  dateTimeFormat,
  numberFormat,
  pluralRules,
  relativeTimeFormat,
} from '../../domain/intl'
import { formatMoney, type Cents } from '../../domain/money'
import type { DateStyle } from '../../domain/settings'
import type { ISODate } from '../../domain/types'

// Dates are formatted in UTC from a UTC-midnight instant: the date string IS the
// calendar day, so the device's zone must not get a chance to shift it.
const utc = (date: ISODate) => {
  const { year, month, day } = parseISODate(date)
  return new Date(Date.UTC(year, month - 1, day))
}

export interface Formatters {
  money: (cents: Cents) => string
  /** "€1.2K", "€300": short amounts for chart axes, where a full "€1,234.56" won't fit. */
  moneyShort: (cents: Cents) => string
  symbol: string
  decimals: number
  /** 0.219 -> "21.9%" (or "21,9 %"), up to two decimals. */
  percent: (ratio: number) => string
  /** "Fri 7 Nov", or "Fri 07/11" with the numbers date style */
  day: (date: ISODate) => string
  /** "Friday 7 November" */
  dayLong: (date: ISODate) => string
  /** "Fri 7 Nov 2026": the date-field preview, in the app's locale whatever the browser's. */
  dayFull: (date: ISODate) => string
  /** "November 2026" */
  month: (date: ISODate) => string
  /** "Mon" for weekday 1 */
  weekday: (dow: number, style?: 'short' | 'narrow' | 'long') => string
  /** "today", "tomorrow", "in 5 days", "3 days ago" */
  relative: (date: ISODate, today: ISODate) => string
  /** "15th" style day-of-month label, English v1 (PLAN §8). */
  ordinal: (n: number) => string
}

export function useFormat(): Formatters {
  const { settings } = useAppSettings()
  const { locale, currency, decimals, dateStyle } = settings
  return useMemo(
    () => makeFormatters(locale, currency, decimals, dateStyle),
    [locale, currency, decimals, dateStyle],
  )
}

/** The same formatters outside React (Settings preview, tests). Intl objects are cached. */
export function makeFormatters(
  locale: string,
  currency: string,
  decimals: number,
  dateStyle: DateStyle = 'words',
): Formatters {
  const dt = (o: Intl.DateTimeFormatOptions) => dateTimeFormat(locale, { ...o, timeZone: 'UTC' })
  const day = dt(
    dateStyle === 'numbers'
      ? { weekday: 'short', day: '2-digit', month: '2-digit' }
      : { weekday: 'short', day: 'numeric', month: 'short' },
  )
  const dayLong = dt({ weekday: 'long', day: 'numeric', month: 'long' })
  const dayFull = dt(
    dateStyle === 'numbers'
      ? { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
  )
  const month = dt({ month: 'long', year: 'numeric' })
  const wd = {
    short: dt({ weekday: 'short' }),
    narrow: dt({ weekday: 'narrow' }),
    long: dt({ weekday: 'long' }),
  }
  // The UI is English in v1 (PLAN §8), so words like "tomorrow" stay English too.
  const rel = relativeTimeFormat('en', { numeric: 'auto' })
  const plural = pluralRules('en', { type: 'ordinal' })
  const percent = numberFormat(locale, { style: 'percent', maximumFractionDigits: 2 })
  const short = numberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  const suffix: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
  return {
    money: (c) => formatMoney(c, currency, locale, decimals),
    moneyShort: (c) => short.format(c / 10 ** decimals),
    symbol: currencySymbol(locale, currency),
    decimals,
    percent: (r) => percent.format(r),
    day: (d) => day.format(utc(d)),
    dayLong: (d) => dayLong.format(utc(d)),
    dayFull: (d) => dayFull.format(utc(d)),
    month: (d) => month.format(utc(d)),
    // 1970-01-04 was a Sunday, so day 4 + dow is that weekday.
    weekday: (dow, style = 'short') => wd[style].format(new Date(Date.UTC(1970, 0, 4 + dow))),
    relative: (d, today) => rel.format(daysBetween(today, d), 'day'),
    ordinal: (n) => `${n}${suffix[plural.select(n)] ?? 'th'}`,
  }
}
