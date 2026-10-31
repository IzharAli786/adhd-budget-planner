import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, dayOfWeek, fromDayNumber, toDayNumber } from '../dates'
import {
  applyWeekendRule,
  calendarMonthPeriod,
  currentPeriod,
  nextPayday,
  nominalPaydays,
  paydaysBetween,
  periodProgress,
  previousPayday,
  primaryIncome,
} from '../paySchedule'
import type { IncomeSource, PaydayOverride, PaySchedule, WeekendRule } from '../types'

const income = (schedule: PaySchedule, weekendRule: WeekendRule = 'none') => ({
  id: 'job',
  schedule,
  weekendRule,
})
const dates = (
  inc: ReturnType<typeof income>,
  from: string,
  to: string,
  o: PaydayOverride[] = [],
) => paydaysBetween(inc, from, to, o).map((p) => p.date)

describe('applyWeekendRule', () => {
  it.each([
    // 2026-10-31 is a Saturday, 2026-11-01 a Sunday.
    ['2026-10-31', 'before', '2026-10-30'],
    ['2026-11-01', 'before', '2026-10-30'],
    ['2026-10-31', 'after', '2026-11-02'],
    ['2026-11-01', 'after', '2026-11-02'],
    ['2026-11-01', 'none', '2026-11-01'],
    ['2026-11-04', 'before', '2026-11-04'],
  ] as const)('%s with %s -> %s', (d, rule, expected) => {
    expect(applyWeekendRule(d, rule)).toBe(expected)
  })
})

describe('all five schedules', () => {
  it.each<[string, PaySchedule, WeekendRule, string, string, string[]]>([
    [
      'weekly',
      { kind: 'weekly', anchor: '2026-01-02' },
      'none',
      '2026-01-01',
      '2026-02-01',
      ['2026-01-02', '2026-01-09', '2026-01-16', '2026-01-23', '2026-01-30'],
    ],
    [
      'biweekly',
      { kind: 'biweekly', anchor: '2026-01-02' },
      'none',
      '2026-01-01',
      '2026-02-15',
      ['2026-01-02', '2026-01-16', '2026-01-30', '2026-02-13'],
    ],
    [
      'biweekly with a future anchor',
      { kind: 'biweekly', anchor: '2026-12-04' },
      'none',
      '2026-11-01',
      '2026-12-01',
      ['2026-11-06', '2026-11-20'],
    ],
    [
      'semimonthly 15 + last',
      { kind: 'semimonthly', days: [15, 'last'] },
      'none',
      '2026-02-01',
      '2026-03-01',
      ['2026-02-15', '2026-02-28'],
    ],
    [
      'semimonthly 15 + last, before (Sun 15th, Sat 28th)',
      { kind: 'semimonthly', days: [15, 'last'] },
      'before',
      '2026-02-01',
      '2026-03-01',
      ['2026-02-13', '2026-02-27'],
    ],
    [
      'semimonthly 1 + 31 clamps in short months',
      { kind: 'semimonthly', days: [1, 31] },
      'none',
      '2026-04-01',
      '2026-05-01',
      ['2026-04-01', '2026-04-30'],
    ],
    [
      'monthly on the 25th',
      { kind: 'monthly', day: 25 },
      'none',
      '2026-01-01',
      '2026-04-01',
      ['2026-01-25', '2026-02-25', '2026-03-25'],
    ],
    [
      'monthly on the 31st clamps',
      { kind: 'monthly', day: 31 },
      'none',
      '2026-01-01',
      '2026-05-01',
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
    ],
    [
      'irregular (unsorted, duplicated input)',
      { kind: 'irregular', expected: ['2026-03-10', '2026-01-05', '2026-03-10', '2025-12-01'] },
      'none',
      '2026-01-01',
      '2026-12-31',
      ['2026-01-05', '2026-03-10'],
    ],
  ])('%s', (_label, schedule, rule, from, to, expected) => {
    expect(dates(income(schedule, rule), from, to)).toEqual(expected)
  })
})

describe('weekend shift across a month boundary', () => {
  const firstOfMonth = income({ kind: 'monthly', day: 1 }, 'before')

  it('Sunday the 1st with "before" pays on the previous Friday, in the previous month', () => {
    expect(dates(firstOfMonth, '2026-10-01', '2026-11-01')).toEqual(['2026-10-01', '2026-10-30'])
    expect(dates(firstOfMonth, '2026-11-01', '2026-12-01')).toEqual([])
  })

  it('last-of-month Saturday with "after" moves into the next month', () => {
    const last = income({ kind: 'monthly', day: 'last' }, 'after')
    expect(dates(last, '2026-10-01', '2026-11-01')).toEqual([])
    expect(dates(last, '2026-11-01', '2026-11-05')).toEqual(['2026-11-02'])
  })

  it('a shifted payday landing on another payday keeps both paychecks', () => {
    // Sun May 31 2026 moves to Mon Jun 1, which is also the "1st" payday.
    const firstAndLast = income({ kind: 'semimonthly', days: [1, 'last'] }, 'after')
    expect(paydaysBetween(firstAndLast, '2026-05-25', '2026-06-05')).toEqual([
      { nominal: '2026-05-31', date: '2026-06-01', overridden: false },
      { nominal: '2026-06-01', date: '2026-06-01', overridden: false },
    ])
    expect(currentPeriod(firstAndLast, '2026-06-01')).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
      daysLeft: 29,
    })
  })

  it('period bounds use the shifted date', () => {
    expect(currentPeriod(firstOfMonth, '2026-10-31')).toEqual({
      start: '2026-10-30',
      end: '2026-12-01',
      daysLeft: 31,
    })
    expect(currentPeriod(firstOfMonth, '2026-10-29')).toEqual({
      start: '2026-10-01',
      end: '2026-10-30',
      daysLeft: 1,
    })
  })
})

describe('nextPayday / previousPayday', () => {
  it.each<[string, PaySchedule, WeekendRule, string, string | null, string | null]>([
    [
      'future biweekly anchor',
      { kind: 'biweekly', anchor: '2026-12-04' },
      'none',
      '2026-10-31',
      '2026-10-23',
      '2026-11-06',
    ],
    [
      'payday today counts as previous',
      { kind: 'weekly', anchor: '2026-01-02' },
      'none',
      '2026-10-30',
      '2026-10-30',
      '2026-11-06',
    ],
    [
      'monthly 15th',
      { kind: 'monthly', day: 15 },
      'none',
      '2026-10-31',
      '2026-10-15',
      '2026-11-15',
    ],
    [
      'monthly 15th, Sunday shifted after',
      { kind: 'monthly', day: 15 },
      'after',
      '2026-11-15',
      '2026-10-15',
      '2026-11-16',
    ],
    [
      'irregular',
      { kind: 'irregular', expected: ['2026-10-20', '2026-11-05'] },
      'none',
      '2026-10-31',
      '2026-10-20',
      '2026-11-05',
    ],
    [
      'irregular far apart',
      { kind: 'irregular', expected: ['2025-01-10', '2027-06-01'] },
      'none',
      '2026-10-31',
      '2025-01-10',
      '2027-06-01',
    ],
    [
      'irregular with nothing ahead',
      { kind: 'irregular', expected: ['2026-10-20'] },
      'none',
      '2026-10-31',
      '2026-10-20',
      null,
    ],
    [
      'irregular with nothing yet',
      { kind: 'irregular', expected: [] },
      'none',
      '2026-10-31',
      null,
      null,
    ],
  ])('%s', (_l, schedule, rule, today, prev, next) => {
    const inc = income(schedule, rule)
    expect(previousPayday(inc, today)).toBe(prev)
    expect(nextPayday(inc, today)).toBe(next)
  })
})

describe('PaydayOverride', () => {
  const monthly = income({ kind: 'monthly', day: 25 }, 'before')
  const early: PaydayOverride = {
    id: 'job|2026-12-25',
    incomeId: 'job',
    originalDate: '2026-12-25',
    date: '2026-12-22',
  }

  it('replaces the nominal date (holiday / early pay)', () => {
    expect(dates(monthly, '2026-12-01', '2027-01-01', [early])).toEqual(['2026-12-22'])
    expect(paydaysBetween(monthly, '2026-12-01', '2027-01-01', [early])[0]).toEqual({
      nominal: '2026-12-25',
      date: '2026-12-22',
      overridden: true,
    })
  })

  it('ignores overrides for other incomes', () => {
    expect(dates(monthly, '2026-12-01', '2027-01-01', [{ ...early, incomeId: 'other' }])).toEqual([
      '2026-12-25',
    ])
  })

  it('beats the weekend rule and moves period bounds', () => {
    // Nov 25 2026 is a Wednesday; pull it a week earlier.
    const o: PaydayOverride = { ...early, originalDate: '2026-11-25', date: '2026-11-18' }
    expect(nextPayday(monthly, '2026-11-01', [o])).toBe('2026-11-18')
    expect(currentPeriod(monthly, '2026-11-20', [o])).toEqual({
      start: '2026-11-18',
      end: '2026-12-25',
      daysLeft: 35,
    })
  })

  it('finds a payday moved far outside the normal window', () => {
    const o: PaydayOverride = { ...early, originalDate: '2026-11-25', date: '2027-02-01' }
    expect(dates(monthly, '2027-02-01', '2027-02-02', [o])).toEqual(['2027-02-01'])
  })
})

describe('currentPeriod', () => {
  it('is null without a next payday', () => {
    expect(
      currentPeriod(income({ kind: 'irregular', expected: ['2026-10-01'] }), '2026-10-31'),
    ).toBeNull()
  })
  it('starts today when the first irregular pay is still ahead', () => {
    expect(
      currentPeriod(income({ kind: 'irregular', expected: ['2026-11-05'] }), '2026-10-31'),
    ).toEqual({
      start: '2026-10-31',
      end: '2026-11-05',
      daysLeft: 5,
    })
  })
  it('calendar month mode', () => {
    expect(calendarMonthPeriod('2026-02-10')).toEqual({
      start: '2026-02-01',
      end: '2026-03-01',
      daysLeft: 19,
    })
  })
  it('progress', () => {
    const p = { start: '2026-11-01', end: '2026-11-11' }
    expect(periodProgress(p, '2026-11-01')).toBe(0)
    expect(periodProgress(p, '2026-11-06')).toBe(0.5)
    expect(periodProgress(p, '2026-12-01')).toBe(1)
  })
})

describe('primaryIncome', () => {
  const base = { primary: false, active: true }
  it('prefers active primary, then first active', () => {
    expect(
      primaryIncome([
        { ...base, n: 1 },
        { ...base, primary: true, n: 2 },
      ])?.n,
    ).toBe(2)
    expect(
      primaryIncome([
        { ...base, primary: true, active: false, n: 1 },
        { ...base, n: 2 },
      ])?.n,
    ).toBe(2)
    expect(primaryIncome<Pick<IncomeSource, 'primary' | 'active'>>([])).toBeUndefined()
  })
})

const isoDate = fc
  .integer({ min: toDayNumber('2000-01-01'), max: toDayNumber('2060-12-31') })
  .map(fromDayNumber)
const schedule: fc.Arbitrary<PaySchedule> = fc.oneof(
  isoDate.map((anchor) => ({ kind: 'weekly' as const, anchor })),
  isoDate.map((anchor) => ({ kind: 'biweekly' as const, anchor })),
  fc
    .tuple(
      fc.integer({ min: 1, max: 28 }),
      fc.oneof(fc.integer({ min: 1, max: 31 }), fc.constant('last' as const)),
    )
    .map(([a, b]) => ({ kind: 'semimonthly' as const, days: [a, b] as [number, number | 'last'] })),
  fc
    .oneof(fc.integer({ min: 1, max: 31 }), fc.constant('last' as const))
    .map((day) => ({ kind: 'monthly' as const, day })),
)
const rule = fc.constantFrom<WeekendRule>('before', 'after', 'none')

describe('payday properties', () => {
  it('regular schedules always have prev <= today < next and the period contains today', () => {
    fc.assert(
      fc.property(schedule, rule, isoDate, (s, r, today) => {
        const p = currentPeriod(income(s, r), today)
        return (
          p !== null && p.start <= today && today < p.end && p.daysLeft >= 1 && p.daysLeft <= 34
        )
      }),
    )
  })

  it('shifted paydays never fall on a weekend', () => {
    fc.assert(
      fc.property(
        schedule,
        fc.constantFrom<WeekendRule>('before', 'after'),
        isoDate,
        (s, r, from) => {
          return dates(income(s, r), from, addDays(from, 60)).every((d) => {
            const dow = dayOfWeek(d)
            return dow !== 0 && dow !== 6
          })
        },
      ),
    )
  })

  it('nominal paydays are sorted, unique and inside the window', () => {
    fc.assert(
      fc.property(schedule, isoDate, fc.integer({ min: 0, max: 400 }), (s, from, len) => {
        const to = addDays(from, len)
        const ds = nominalPaydays(s, from, to)
        return ds.every((d, i) => d >= from && d < to && (i === 0 || ds[i - 1]! < d))
      }),
    )
  })
})
