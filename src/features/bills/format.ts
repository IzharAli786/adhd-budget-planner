import { useMemo } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { daysBetween, parseISODate } from '../../domain/dates'
import { formatMoney, type Cents } from '../../domain/money'
import type { ISODate } from '../../domain/types'

// Dates are formatted in UTC from a UTC-midnight instant: the date string IS the
// calendar day, so the device's zone must not get a chance to shift it.
const utc = (date: ISODate) => {
  const { year, month, day } = parseISODate(date)
  return new Date(Date.UTC(year, month - 1, day))
}

export interface Formatters {
  money: (cents: Cents) => string
  symbol: string
  decimals: number
  /** "Fri 7 Nov" */
  day: (date: ISODate) => string
  /** "Friday 7 November" */
  dayLong: (date: ISODate) => string
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
  const { locale, currency, decimals } = settings
  return useMemo(() => {
    const dt = (o: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' })
    const day = dt({ weekday: 'short', day: 'numeric', month: 'short' })
    const dayLong = dt({ weekday: 'long', day: 'numeric', month: 'long' })
    const month = dt({ month: 'long', year: 'numeric' })
    const wd = {
      short: dt({ weekday: 'short' }),
      narrow: dt({ weekday: 'narrow' }),
      long: dt({ weekday: 'long' }),
    }
    const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    const symbol =
      new Intl.NumberFormat(locale, { style: 'currency', currency })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value ?? currency
    const plural = new Intl.PluralRules('en', { type: 'ordinal' })
    const suffix: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }
    return {
      money: (c) => formatMoney(c, currency, locale, decimals),
      symbol,
      decimals,
      day: (d) => day.format(utc(d)),
      dayLong: (d) => dayLong.format(utc(d)),
      month: (d) => month.format(utc(d)),
      // 1970-01-04 was a Sunday, so day 4 + dow is that weekday.
      weekday: (dow, style = 'short') => wd[style].format(new Date(Date.UTC(1970, 0, 4 + dow))),
      relative: (d, today) => rel.format(daysBetween(today, d), 'day'),
      ordinal: (n) => `${n}${suffix[plural.select(n)] ?? 'th'}`,
    }
  }, [locale, currency, decimals])
}
