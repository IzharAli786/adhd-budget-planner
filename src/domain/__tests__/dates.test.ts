import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  compareISODate,
  dayOfWeek,
  daysBetween,
  fromDayNumber,
  isLeapYear,
  isValidISODate,
  lastDayOfMonth,
  makeDate,
  mod,
  monthsBetween,
  parseISODate,
  toDayNumber,
} from '../dates'

describe('isValidISODate', () => {
  it.each(['2026-01-01', '2024-02-29', '2000-02-29', '2026-12-31'])('accepts %s', (d) => {
    expect(isValidISODate(d)).toBe(true)
  })
  it.each([
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-1-01',
    '2026-01-01T00:00',
    '',
    20260101,
    null,
  ])('rejects %j', (d) => {
    expect(isValidISODate(d)).toBe(false)
  })
})

describe('parse/format', () => {
  it('parses parts', () => {
    expect(parseISODate('2026-03-09')).toEqual({ year: 2026, month: 3, day: 9 })
  })
  it('throws on invalid input', () => {
    expect(() => parseISODate('2026-02-30')).toThrow(RangeError)
  })
})

describe('lastDayOfMonth / isLeapYear', () => {
  it.each([
    [2026, 1, 31],
    [2026, 2, 28],
    [2024, 2, 29],
    [2000, 2, 29],
    [1900, 2, 28],
    [2026, 4, 30],
    [2026, 12, 31],
  ])('%i-%i has %i days', (y, m, d) => {
    expect(lastDayOfMonth(y, m)).toBe(d)
  })
  it.each([
    [2024, true],
    [2026, false],
    [2000, true],
    [1900, false],
  ])('isLeapYear(%i) = %s', (y, leap) => {
    expect(isLeapYear(y)).toBe(leap)
  })
})

describe('addDays', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    // EU DST changes: date-only UTC math must not lose or gain a day.
    ['2026-03-28', 1, '2026-03-29'],
    ['2026-03-29', 1, '2026-03-30'],
    ['2026-10-24', 1, '2026-10-25'],
    ['2026-10-25', 1, '2026-10-26'],
    ['2026-01-01', 365, '2027-01-01'],
    ['2026-01-10', 0, '2026-01-10'],
    // Two-digit years: Date.UTC would silently read 0050 as 1950.
    ['0050-12-31', 1, '0051-01-01'],
  ])('%s + %i = %s', (d, n, expected) => {
    expect(addDays(d, n)).toBe(expected)
  })
})

describe('addMonths (clamps)', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2024-01-31', 1, '2024-02-29'],
    ['2026-01-31', 2, '2026-03-31'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-11-15', 2, '2027-01-15'],
    ['2026-01-15', -1, '2025-12-15'],
    ['2026-01-15', -13, '2024-12-15'],
    ['2024-02-29', 12, '2025-02-28'],
  ])('%s + %i months = %s', (d, n, expected) => {
    expect(addMonths(d, n)).toBe(expected)
  })
})

describe('daysBetween / monthsBetween', () => {
  it.each([
    ['2026-01-01', '2026-01-01', 0],
    ['2026-01-01', '2026-01-02', 1],
    ['2026-01-02', '2026-01-01', -1],
    ['2026-03-01', '2026-04-01', 31],
    ['2026-03-28', '2026-03-30', 2],
    ['2024-01-01', '2025-01-01', 366],
  ])('%s -> %s = %i days', (a, b, n) => {
    expect(daysBetween(a, b)).toBe(n)
  })
  it.each([
    ['2026-01-31', '2026-03-01', 2],
    ['2026-01-01', '2026-01-31', 0],
    ['2026-05-10', '2025-05-10', -12],
  ])('%s -> %s = %i months', (a, b, n) => {
    expect(monthsBetween(a, b)).toBe(n)
  })
})

describe('dayOfWeek', () => {
  it.each([
    ['1970-01-01', 4],
    ['2026-10-31', 6],
    ['2026-11-01', 0],
    ['2026-11-02', 1],
    ['2024-02-29', 4],
    ['1969-12-31', 3],
  ])('%s is day %i', (d, dow) => {
    expect(dayOfWeek(d)).toBe(dow)
  })
})

describe('misc', () => {
  it('compareISODate orders dates', () => {
    expect(compareISODate('2026-01-01', '2026-01-02')).toBe(-1)
    expect(compareISODate('2026-01-02', '2026-01-01')).toBe(1)
    expect(compareISODate('2026-01-01', '2026-01-01')).toBe(0)
  })
  it('makeDate clamps and supports last', () => {
    expect(makeDate(2026, 2, 31)).toBe('2026-02-28')
    expect(makeDate(2026, 2, 'last')).toBe('2026-02-28')
    expect(makeDate(2026, 4, 0)).toBe('2026-04-01')
  })
  it('mod is non-negative', () => {
    expect(mod(-1, 7)).toBe(6)
    expect(mod(14, 7)).toBe(0)
  })
})

const isoDate = fc
  .integer({ min: toDayNumber('1990-01-01'), max: toDayNumber('2100-12-31') })
  .map(fromDayNumber)

describe('date properties', () => {
  it('addDays and daysBetween are inverse', () => {
    fc.assert(
      fc.property(isoDate, fc.integer({ min: -2000, max: 2000 }), (d, n) => {
        const r = addDays(d, n)
        return isValidISODate(r) && daysBetween(d, r) === n
      }),
    )
  })
  it('dayOfWeek advances by one each day', () => {
    fc.assert(fc.property(isoDate, (d) => dayOfWeek(addDays(d, 1)) === (dayOfWeek(d) + 1) % 7))
  })
  it('matches the JS Date weekday', () => {
    fc.assert(fc.property(isoDate, (d) => dayOfWeek(d) === new Date(`${d}T12:00:00Z`).getUTCDay()))
  })
})
