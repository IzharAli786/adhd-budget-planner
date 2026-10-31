// Calendar math on 'YYYY-MM-DD' strings. Everything goes through Date.UTC on date-only
// values: UTC has no DST, so a "day" is always exactly 86 400 000 ms and adding days
// can never land on 23:00 of the previous date the way local-time math does.
import type { DayOfMonth, ISODate } from './types'

const MS_PER_DAY = 86_400_000
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface DateParts {
  year: number
  month: number // 1-12
  day: number
}

// Date.UTC maps years 0-99 to 1900-1999, so set the full year explicitly.
function utcMs(year: number, monthIndex: number, day: number): number {
  const d = new Date(0)
  d.setUTCFullYear(year, monthIndex, day)
  return d.getTime()
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Last day number of a month (month is 1-12). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(utcMs(year, month, 0)).getUTCDate()
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false
  const m = ISO_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month)
}

export function parseISODate(date: ISODate): DateParts {
  if (!isValidISODate(date)) throw new RangeError(`Invalid ISO date: ${date}`)
  const [y, m, d] = date.split('-')
  return { year: Number(y), month: Number(m), day: Number(d) }
}

export function formatISODate({ year, month, day }: DateParts): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Builds a date, clamping the day into the month (Feb 31 -> Feb 28/29). */
export function makeDate(year: number, month: number, day: DayOfMonth): ISODate {
  const last = lastDayOfMonth(year, month)
  return formatISODate({
    year,
    month,
    day: day === 'last' ? last : Math.min(Math.max(day, 1), last),
  })
}

/** Days since 1970-01-01. Handy as a sortable, subtractable integer. */
export function toDayNumber(date: ISODate): number {
  const { year, month, day } = parseISODate(date)
  return utcMs(year, month - 1, day) / MS_PER_DAY
}

export function fromDayNumber(n: number): ISODate {
  const d = new Date(n * MS_PER_DAY)
  return formatISODate({
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  })
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days)
}

/** Adds calendar months and clamps the day: Jan 31 + 1 month = Feb 28 (or 29). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { year, month, day } = parseISODate(date)
  const index = year * 12 + (month - 1) + months
  return makeDate(Math.floor(index / 12), mod(index, 12) + 1, day)
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a)
}

/** 0 = Sunday ... 6 = Saturday, same convention as Date#getDay. */
export function dayOfWeek(date: ISODate): number {
  // 1970-01-01 was a Thursday (4).
  return mod(toDayNumber(date) + 4, 7)
}

export function isWeekend(date: ISODate): boolean {
  const dow = dayOfWeek(date)
  return dow === 0 || dow === 6
}

/** ISO strings sort lexically, so plain string comparison is correct and fast. */
export function compareISODate(a: ISODate, b: ISODate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

export const minDate = (a: ISODate, b: ISODate): ISODate => (a <= b ? a : b)
export const maxDate = (a: ISODate, b: ISODate): ISODate => (a >= b ? a : b)

/** Month difference ignoring the day: 2026-01-31 -> 2026-03-01 is 2. */
export function monthsBetween(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a)
  const pb = parseISODate(b)
  return (pb.year - pa.year) * 12 + (pb.month - pa.month)
}

/** Modulo that stays non-negative for negative inputs (JS % does not). */
export function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}
