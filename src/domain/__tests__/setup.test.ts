import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, dayOfWeek } from '../dates'
import { currentPeriod, nextPayday } from '../paySchedule'
import {
  defaultOtherDay,
  isSetupComplete,
  paydaySuggestions,
  previousStep,
  resumeStep,
  scheduleFromSetup,
  stepNumber,
  validateNextPayday,
  validateOtherDay,
  validatePayKind,
  suggestOtherDay,
  type PayKind,
  type SetupProgress,
} from '../setup'

const ACK = '2026-10-31T10:00:00.000Z'

describe('resumeStep', () => {
  it.each<[string, SetupProgress | undefined, string]>([
    ['fresh install', undefined, 'ack'],
    ['acknowledged', { step: 'payday', ackAt: ACK }, 'payday'],
    ['payday answered', { step: 'pay', ackAt: ACK, nextPayday: '2026-11-06' }, 'pay'],
    [
      'pay answered',
      { step: 'balance', ackAt: ACK, nextPayday: '2026-11-06', kind: 'weekly', amount: 50000 },
      'balance',
    ],
    ['went back to payday', { step: 'payday', ackAt: ACK, nextPayday: '2026-11-06' }, 'payday'],
    ['done', { step: 'done' }, 'done'],
    // A stored step never skips an unanswered question.
    ['skips ack', { step: 'balance' }, 'ack'],
    ['skips payday', { step: 'balance', ackAt: ACK, kind: 'weekly', amount: 1 }, 'payday'],
    ['skips amount', { step: 'balance', ackAt: ACK, nextPayday: '2026-11-06' }, 'pay'],
    // Left half-done until the saved payday came round: ask for the next one again.
    [
      'payday now today',
      { step: 'balance', ackAt: ACK, nextPayday: '2026-10-31', kind: 'weekly', amount: 1 },
      'payday',
    ],
    ['payday passed', { step: 'pay', ackAt: ACK, nextPayday: '2026-10-20' }, 'payday'],
  ])('%s', (_, progress, want) => {
    expect(resumeStep(progress, '2026-10-31')).toBe(want)
  })
})

describe('step navigation', () => {
  it.each([
    ['ack', null],
    ['payday', null], // the acknowledgement is one-time: no way back to it
    ['pay', 'payday'],
    ['balance', 'pay'],
  ] as const)('back from %s -> %s', (step, want) => {
    expect(previousStep(step)).toBe(want)
  })

  it('numbers the steps 1-4', () => {
    expect(['ack', 'payday', 'pay', 'balance', 'done'].map((s) => stepNumber(s as 'ack'))).toEqual([
      1, 2, 3, 4, 4,
    ])
  })
})

describe('isSetupComplete', () => {
  it.each<[SetupProgress | undefined, boolean, boolean]>([
    [undefined, false, false],
    [{ step: 'balance' }, false, false],
    [{ step: 'done' }, false, true],
    [undefined, true, true], // an older backup without progress, restored
  ])('%j with income=%s -> %s', (p, hasIncome, want) => {
    expect(isSetupComplete(p, hasIncome)).toBe(want)
  })
})

describe('validateNextPayday', () => {
  const today = '2026-10-31'
  it.each([
    ['', 'Pick'],
    ['2026-02-30', 'Pick'],
    ['2026-10-30', 'passed'],
    ['2026-10-31', 'Paid today'], // today starts the new period; next is the one after
    ['2027-06-01', 'long way'],
  ])('%j is rejected', (date, msg) => {
    expect(validateNextPayday(date, today)).toContain(msg)
  })
  it.each(['2026-11-01', '2026-11-06', addDays(today, 120)])('%s is fine', (date) => {
    expect(validateNextPayday(date, today)).toBeNull()
  })
})

describe('scheduleFromSetup', () => {
  it.each<[PayKind, string, unknown]>([
    ['weekly', '2026-11-06', { kind: 'weekly', anchor: '2026-11-06' }],
    ['biweekly', '2026-11-06', { kind: 'biweekly', anchor: '2026-11-06' }],
    ['monthly', '2026-11-25', { kind: 'monthly', day: 25 }],
    ['monthly', '2026-11-30', { kind: 'monthly', day: 'last' }], // ends its month
    ['monthly', '2026-12-30', { kind: 'monthly', day: 30 }], // Dec has 31 days
    ['semimonthly', '2026-11-13', { kind: 'semimonthly', days: [13, 'last'] }],
    ['semimonthly', '2026-11-30', { kind: 'semimonthly', days: [15, 'last'] }],
    ['semimonthly', '2026-12-01', { kind: 'semimonthly', days: [1, 15] }],
    ['semimonthly', '2026-11-20', { kind: 'semimonthly', days: [5, 20] }],
    ['irregular', '2026-11-06', { kind: 'irregular', expected: ['2026-11-06'] }],
  ])('%s from %s', (kind, date, want) => {
    expect(scheduleFromSetup(kind, date).schedule).toEqual(want)
  })

  it('uses the chosen other payday for twice a month', () => {
    expect(scheduleFromSetup('semimonthly', '2026-11-25', 10).schedule).toEqual({
      kind: 'semimonthly',
      days: [10, 25],
    })
  })

  it('keeps a weekend payday where it is', () => {
    expect(scheduleFromSetup('monthly', '2026-11-01').weekendRule).toBe('none') // Sunday
    expect(scheduleFromSetup('monthly', '2026-11-02').weekendRule).toBe('before')
  })

  // The core promise: the date the person typed is exactly the next payday Steady shows
  // TODAY (not just the day before it), and today sits inside a period that ends there.
  it('the given date is the next payday, for every kind (property)', () => {
    const kinds = fc.constantFrom<PayKind>(
      'weekly',
      'biweekly',
      'semimonthly',
      'monthly',
      'irregular',
    )
    const day = fc.integer({ min: 0, max: 3000 }).map((n) => addDays('2024-01-01', n))
    fc.assert(
      fc.property(kinds, day, fc.integer({ min: 1, max: 120 }), (kind, today, ahead) => {
        const date = addDays(today, ahead)
        fc.pre(validateNextPayday(date, today) === null)
        fc.pre(validatePayKind(kind, date, today) === null)
        const { schedule, weekendRule } = scheduleFromSetup(kind, date)
        const income = { id: 'i', schedule, weekendRule }
        const period = currentPeriod(income, today)
        return (
          nextPayday(income, today) === date &&
          period?.end === date &&
          period.start <= today &&
          period.daysLeft === ahead
        )
      }),
    )
  })
})

describe('validatePayKind', () => {
  const today = '2026-10-31' // Saturday
  it.each<[PayKind, string, boolean]>([
    ['weekly', '2026-11-06', true],
    ['weekly', '2026-11-07', true], // exactly a week ahead
    ['weekly', '2026-11-20', false], // three weeks away, yet "every week"
    ['biweekly', '2026-11-13', true],
    ['biweekly', '2026-11-20', false],
    ['monthly', '2026-11-30', true],
    ['monthly', '2026-12-25', false], // there would be a 25 Nov payday first
    ['semimonthly', '2026-11-13', true],
    ['irregular', '2027-02-01', true],
  ])('%s with next payday %s -> ok=%s', (kind, date, ok) => {
    expect(validatePayKind(kind, date, today) === null).toBe(ok)
  })

  it('a chosen other payday that comes first is caught', () => {
    expect(validatePayKind('semimonthly', '2026-11-25', today, 10)).toContain('other payday')
    expect(validatePayKind('semimonthly', '2026-11-10', today, 25)).toBeNull()
  })

  it('accepts every date within one period, for every kind (property)', () => {
    const periodDays: Record<PayKind, number> = {
      weekly: 7,
      biweekly: 14,
      semimonthly: 1,
      monthly: 28,
      irregular: 120,
    }
    const kinds = fc.constantFrom<PayKind>('weekly', 'biweekly', 'monthly', 'irregular')
    const day = fc.integer({ min: 0, max: 3000 }).map((n) => addDays('2024-01-01', n))
    fc.assert(
      fc.property(kinds, day, fc.integer({ min: 1, max: 120 }), (kind, t, ahead) => {
        fc.pre(ahead <= periodDays[kind])
        return validatePayKind(kind, addDays(t, ahead), t) === null
      }),
    )
  })
})

describe('validateOtherDay', () => {
  it.each([
    ['2026-11-15', 15, false],
    ['2026-11-30', 'last', false], // the 30th ends November
    ['2026-11-15', 'last', true],
    ['2026-12-30', 'last', true], // December has a 31st
  ] as const)('%s with %s -> ok=%s', (date, other, ok) => {
    expect(validateOtherDay(date, other) === null).toBe(ok)
  })

  it('the default guess is always valid', () => {
    const day = fc.integer({ min: 0, max: 3000 }).map((n) => addDays('2024-01-01', n))
    fc.assert(fc.property(day, (d) => validateOtherDay(d, defaultOtherDay(d)) === null))
  })
})

describe('suggestOtherDay', () => {
  it.each([
    ['2026-10-31', '2026-11-13', 'last'], // 13 & last: the 31 Oct payday is today
    ['2026-10-31', '2026-11-20', 'last'], // 5 & 20 would put 5 Nov first
    ['2026-11-06', '2026-11-20', 5], // the common pair fits: 5 Dec comes after
  ] as const)('today %s, next %s -> %s', (today, date, want) => {
    expect(suggestOtherDay(date, today)).toBe(want)
  })

  // Twice a month means paydays at most about half a month apart.
  it('always gives a valid pair when the next payday is within half a month', () => {
    const day = fc.integer({ min: 0, max: 3000 }).map((n) => addDays('2024-01-01', n))
    fc.assert(
      fc.property(day, fc.integer({ min: 1, max: 16 }), (today, ahead) => {
        const date = addDays(today, ahead)
        const other = suggestOtherDay(date, today)
        return (
          validateOtherDay(date, other) === null &&
          validatePayKind('semimonthly', date, today, other) === null
        )
      }),
    )
  })
})

describe('defaultOtherDay', () => {
  it.each([
    ['2026-11-01', 15],
    ['2026-11-15', 'last'],
    ['2026-11-05', 20],
    ['2026-11-30', 15],
    ['2026-11-20', 5],
  ])('%s -> %s', (date, want) => {
    expect(defaultOtherDay(date)).toBe(want)
  })
})

describe('paydaySuggestions', () => {
  it.each([
    // Sat 31 Oct: 1 Nov, Friday 6 Nov, 15 Nov. Today (last of Oct) is never offered.
    ['2026-10-31', ['2026-11-01', '2026-11-06', '2026-11-15']],
    // Mon 2 Nov
    ['2026-11-02', ['2026-11-06', '2026-11-15', '2026-11-30', '2026-12-01']],
    // Tue 15 Dec: the 15th is today, so next month's; crosses the year
    ['2026-12-15', ['2026-12-18', '2026-12-31', '2027-01-01', '2027-01-15']],
    // Fri 6 Nov: next Friday, not today
    ['2026-11-06', ['2026-11-13', '2026-11-15', '2026-11-30', '2026-12-01']],
  ])('%s', (today, want) => {
    expect(paydaySuggestions(today)).toEqual(want)
  })

  it('suggests only valid dates after today, including a Friday', () => {
    const day = fc.integer({ min: 0, max: 3000 }).map((n) => addDays('2024-01-01', n))
    fc.assert(
      fc.property(day, (today) => {
        const s = paydaySuggestions(today)
        return (
          s.length >= 2 &&
          s.every((d) => validateNextPayday(d, today) === null) &&
          s.some((d) => dayOfWeek(d) === 5) &&
          [...s].sort().join() === s.join()
        )
      }),
    )
  })
})
