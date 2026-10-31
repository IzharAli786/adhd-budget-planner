import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { badgeCount } from '../badge'
import type { BillEntry } from '../bills'
import { catchUp, SHORT_GAP_MAX_DAYS, type CatchUpInput } from '../catchUp'
import { addDays } from '../dates'
import { isImpulseExpired } from '../impulse'
import type { ImpulseItem } from '../types'

const TODAY = '2026-11-20'
const NOW = '2026-11-20T12:00:00.000Z'

const entry = (date: string, extra: Partial<BillEntry> = {}): BillEntry => ({
  billId: `b-${date}`,
  originalDate: date,
  date,
  amount: 1000,
  status: 'due',
  moved: false,
  name: 'Bill',
  autopay: false,
  ...extra,
})

const item = (addedAt: string, extra: Partial<ImpulseItem> = {}): ImpulseItem => ({
  id: `i-${addedAt}`,
  name: 'Lamp',
  amount: 4000,
  addedAt,
  ...extra,
})

const input = (extra: Partial<CatchUpInput>): CatchUpInput => ({
  lastOpened: TODAY,
  today: TODAY,
  due: [],
  periodStart: '2026-11-01',
  impulse: [],
  now: NOW,
  ...extra,
})

describe('isImpulseExpired', () => {
  it.each<[string, ImpulseItem, boolean]>([
    ['exactly 48 h', item('2026-11-18T12:00:00.000Z'), true],
    ['one ms short', item('2026-11-18T12:00:00.001Z'), false],
    ['long ago', item('2026-10-01T00:00:00.000Z'), true],
    ['already decided', item('2026-10-01T00:00:00.000Z', { decision: 'skipped' }), false],
  ])('%s', (_, it_, expected) => expect(isImpulseExpired(it_, NOW)).toBe(expected))
})

describe('catchUp: which mode', () => {
  const bill = [entry('2026-11-15')]
  it.each<[string, Partial<CatchUpInput>, string]>([
    ['first open ever', { lastOpened: null, due: bill }, 'none'],
    ['open today already', { lastOpened: TODAY, due: bill }, 'none'],
    ['opened yesterday', { lastOpened: '2026-11-19', due: [entry('2026-11-19')] }, 'none'],
    ['2 days, a bill came due', { lastOpened: '2026-11-18', due: [entry('2026-11-19')] }, 'short'],
    ['7 days, a bill came due', { lastOpened: '2026-11-13', due: bill }, 'short'],
    ['3 days, nothing happened', { lastOpened: '2026-11-17' }, 'none'],
    ['8 days, nothing happened', { lastOpened: '2026-11-12' }, 'fresh'],
    ['3 weeks', { lastOpened: '2026-10-30', due: bill }, 'fresh'],
    ['clock moved back', { lastOpened: '2026-11-25', due: bill }, 'none'],
  ])('%s -> %s', (_, extra, mode) => expect(catchUp(input(extra)).mode).toBe(mode))
})

describe('catchUp: short gap counts', () => {
  it.each<[string, Partial<CatchUpInput>, object]>([
    [
      'only bills dated inside the gap count',
      {
        lastOpened: '2026-11-16',
        due: [
          entry('2026-11-10'), // before the gap: the action card already asked
          entry('2026-11-16'), // the day of the last open: seen then
          entry('2026-11-17'),
          entry('2026-11-20'),
          entry('2026-11-21'), // tomorrow: not "while you were away"
          entry('2026-11-18', { status: 'paid' }),
        ],
      },
      { billsCameDue: 2, paydayPassed: false, expiredImpulse: 0 },
    ],
    [
      'a payday inside the gap',
      { lastOpened: '2026-11-16', periodStart: '2026-11-18' },
      { billsCameDue: 0, paydayPassed: true, expiredImpulse: 0, daysAway: 4 },
    ],
    [
      'a payday on the last open day was already seen',
      { lastOpened: '2026-11-16', periodStart: '2026-11-16' },
      { mode: 'none' },
    ],
    [
      'expired 48h items',
      {
        lastOpened: '2026-11-16',
        impulse: [item('2026-11-15T09:00:00.000Z'), item('2026-11-20T09:00:00.000Z')],
      },
      { expiredImpulse: 1 },
    ],
  ])('%s', (_, extra, expected) => expect(catchUp(input(extra))).toMatchObject(expected))
})

describe('catchUp: fresh start', () => {
  it('splits past bills into autopay (marked paid) and manual (asked), archives expired items', () => {
    const result = catchUp(
      input({
        lastOpened: '2026-10-25',
        due: [
          entry('2026-11-01', { name: 'Rent', autopay: true }),
          entry('2026-11-05', { name: 'Phone' }),
          entry('2026-11-20', { name: 'Gym', autopay: true }), // today counts as past
          entry('2026-11-25', { name: 'Later' }), // still ahead: left alone
          entry('2026-11-03', { name: 'Skipped', status: 'skipped' }),
        ],
        impulse: [
          item('2026-11-01T09:00:00.000Z'),
          item('2026-11-19T20:00:00.000Z'),
          item('2026-11-01T09:00:00.000Z', { id: 'done', decision: 'bought' }),
        ],
      }),
    )
    expect(result.mode).toBe('fresh')
    if (result.mode !== 'fresh') return
    expect(result.daysAway).toBe(26)
    expect(result.autoPaid.map((e) => e.name)).toEqual(['Rent', 'Gym'])
    expect(result.ask.map((e) => e.name)).toEqual(['Phone'])
    expect(result.archive).toEqual(['i-2026-11-01T09:00:00.000Z'])
  })

  it('property: never touches a future bill, and every past due bill is handled once', () => {
    const day = fc.integer({ min: -40, max: 20 }).map((n) => addDays(TODAY, n))
    fc.assert(
      fc.property(
        fc.array(fc.record({ date: day, autopay: fc.boolean() }), { maxLength: 12 }),
        fc.integer({ min: SHORT_GAP_MAX_DAYS + 1, max: 90 }),
        (rows, away) => {
          const due = rows.map((r, i) => entry(r.date, { billId: `b${i}`, autopay: r.autopay }))
          const result = catchUp(input({ lastOpened: addDays(TODAY, -away), due }))
          if (result.mode !== 'fresh') return false
          const handled = [...result.autoPaid, ...result.ask]
          const past = due.filter((e) => e.date <= TODAY)
          return (
            handled.length === past.length &&
            handled.every((e) => e.date <= TODAY) &&
            result.autoPaid.every((e) => e.autopay) &&
            result.ask.every((e) => !e.autopay)
          )
        },
      ),
    )
  })
})

describe('badgeCount', () => {
  it.each<[string, BillEntry[], ImpulseItem[], number]>([
    ['nothing', [], [], 0],
    [
      'due today, tomorrow and in 2 days',
      [entry(TODAY), entry('2026-11-21'), entry('2026-11-22')],
      [],
      3,
    ],
    ['in 3 days is too far', [entry('2026-11-23')], [], 0],
    [
      'paid and skipped do not count',
      [entry(TODAY, { status: 'paid' }), entry(TODAY, { status: 'skipped' })],
      [],
      0,
    ],
    ['an overdue manual bill still needs an answer', [entry('2026-11-10')], [], 1],
    [
      'an overdue autopay bill most likely went out',
      [entry('2026-11-10', { autopay: true })],
      [],
      0,
    ],
    ['plus expired 48h items', [entry(TODAY)], [item('2026-11-01T00:00:00.000Z'), item(NOW)], 2],
  ])('%s', (_, entries, impulse, expected) =>
    expect(badgeCount({ entries, impulse, today: TODAY, now: NOW })).toBe(expected),
  )
})
