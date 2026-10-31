import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, dayOfWeek } from '../dates'
import { nextPayday } from '../paySchedule'
import {
  defaultOtherDay,
  isSetupComplete,
  paydaySuggestions,
  previousStep,
  resumeStep,
  scheduleFromSetup,
  stepNumber,
  validateNextPayday,
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
  ])('%s', (_, progress, want) => {
    expect(resumeStep(progress)).toBe(want)
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
    ['2027-06-01', 'long way'],
  ])('%j is rejected', (date, msg) => {
    expect(validateNextPayday(date, today)).toContain(msg)
  })
  it.each(['2026-10-31', '2026-11-06', addDays(today, 120)])('%s is fine', (date) => {
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

  // The core promise: the date the person typed is exactly the next payday Steady shows.
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
      fc.property(kinds, day, fc.integer({ min: 0, max: 120 }), (kind, today, ahead) => {
        const date = addDays(today, ahead)
        const { schedule, weekendRule } = scheduleFromSetup(kind, date)
        const income = { id: 'i', schedule, weekendRule }
        return nextPayday(income, addDays(date, -1)) === date
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
    // Sat 31 Oct: Friday 6 Nov, 15 Nov, today (last of Oct), 1 Nov
    ['2026-10-31', ['2026-10-31', '2026-11-01', '2026-11-06', '2026-11-15']],
    // Mon 2 Nov
    ['2026-11-02', ['2026-11-06', '2026-11-15', '2026-11-30', '2026-12-01']],
    // Tue 15 Dec: crosses the year
    ['2026-12-15', ['2026-12-15', '2026-12-18', '2026-12-31', '2027-01-01']],
  ])('%s', (today, want) => {
    expect(paydaySuggestions(today)).toEqual(want)
  })

  it('suggests only valid dates on or after today, Friday first among weekdays', () => {
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
