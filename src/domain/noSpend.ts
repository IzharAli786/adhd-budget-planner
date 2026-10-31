// No-spend days: a tap to mark today, a strip of recent days, a gentle count. No streaks
// (PLAN §1.3): a missed day is just a day, so nothing here measures runs in a row.
import { addDays } from './dates'
import type { ISODate, NoSpendDay } from './types'

/** The last `n` days ending today, oldest first, each with whether it was marked. */
export function noSpendStrip(days: readonly NoSpendDay[], today: ISODate, n = 7) {
  const marked = new Set(days.map((d) => d.date))
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1)
    return { date, marked: marked.has(date) }
  })
}

/** Marked days in [from, to], inclusive. */
export function noSpendCount(days: readonly NoSpendDay[], from: ISODate, to: ISODate): number {
  return new Set(days.filter((d) => d.date >= from && d.date <= to).map((d) => d.date)).size
}
