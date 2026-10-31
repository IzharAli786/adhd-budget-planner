// Month grid for the Bills calendar. Pure date strings in, date strings out, so the
// grid never depends on the device's time zone.
import { addDays, addMonths, dayOfWeek, makeDate, mod, parseISODate } from './dates'
import type { ISODate } from './types'

export interface MonthGrid {
  /** First day of the month shown. */
  month: ISODate
  /** Whole weeks (7 dates each), starting on `weekStart`, covering every day of the month. */
  weeks: ISODate[][]
}

/** `weekStart`: 0 = Sunday ... 6 = Saturday, like dayOfWeek(). */
export function monthGrid(anyDayInMonth: ISODate, weekStart: number): MonthGrid {
  const { year, month } = parseISODate(anyDayInMonth)
  const first = makeDate(year, month, 1)
  const next = addMonths(first, 1)
  let day = addDays(first, -mod(dayOfWeek(first) - weekStart, 7))
  const weeks: ISODate[][] = []
  while (day < next) {
    const week: ISODate[] = []
    for (let i = 0; i < 7; i++, day = addDays(day, 1)) week.push(day)
    weeks.push(week)
  }
  return { month: first, weeks }
}

/** Weekday numbers in display order, e.g. [1,2,3,4,5,6,0] for a Monday start. */
export function weekdayOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, i) => mod(weekStart + i, 7))
}

export const isSameMonth = (a: ISODate, b: ISODate) => a.slice(0, 7) === b.slice(0, 7)
