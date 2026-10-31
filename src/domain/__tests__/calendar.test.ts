import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { monthGrid, weekdayOrder } from '../calendar'
import { dayOfWeek, fromDayNumber, lastDayOfMonth, parseISODate, toDayNumber } from '../dates'

describe('monthGrid', () => {
  it.each<[string, number, string, string, number]>([
    // month, weekStart, first cell, last cell, weeks
    ['2026-11-15', 1, '2026-10-26', '2026-12-06', 6], // Nov 2026 starts on a Sunday
    ['2026-11-15', 0, '2026-11-01', '2026-12-05', 5],
    ['2026-02-01', 0, '2026-02-01', '2026-02-28', 4], // Feb 2026: Sun 1st to Sat 28th
    ['2026-02-10', 1, '2026-01-26', '2026-03-01', 5],
    ['2024-02-29', 6, '2024-01-27', '2024-03-01', 5], // leap year, Saturday start
  ])('%s with week start %i', (day, weekStart, first, last, weeks) => {
    const grid = monthGrid(day, weekStart)
    expect(grid.weeks[0]![0]).toBe(first)
    expect(grid.weeks.at(-1)!.at(-1)).toBe(last)
    expect(grid.weeks).toHaveLength(weeks)
    expect(grid.month).toBe(day.slice(0, 8) + '01')
  })

  const isoDate = fc
    .integer({ min: toDayNumber('1990-01-01'), max: toDayNumber('2100-12-31') })
    .map(fromDayNumber)

  it('always covers the whole month in consecutive weeks that start on weekStart', () => {
    fc.assert(
      fc.property(isoDate, fc.integer({ min: 0, max: 6 }), (day, weekStart) => {
        const { weeks } = monthGrid(day, weekStart)
        const cells = weeks.flat()
        const { year, month } = parseISODate(day)
        for (const w of weeks) {
          expect(w).toHaveLength(7)
          expect(dayOfWeek(w[0]!)).toBe(weekStart)
        }
        for (let i = 1; i < cells.length; i++) {
          expect(toDayNumber(cells[i]!) - toDayNumber(cells[i - 1]!)).toBe(1)
        }
        const inMonth = cells.filter((c) => c.startsWith(day.slice(0, 7)))
        expect(inMonth).toHaveLength(lastDayOfMonth(year, month))
        // No week is made only of other months' days.
        for (const w of weeks) expect(w.some((c) => c.startsWith(day.slice(0, 7)))).toBe(true)
      }),
    )
  })
})

describe('weekdayOrder', () => {
  it.each([
    [1, [1, 2, 3, 4, 5, 6, 0]],
    [0, [0, 1, 2, 3, 4, 5, 6]],
    [6, [6, 0, 1, 2, 3, 4, 5]],
  ])('week start %i', (start, order) => expect(weekdayOrder(start)).toEqual(order))
})
