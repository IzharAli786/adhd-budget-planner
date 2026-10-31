import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays, fromDayNumber, toDayNumber } from '../dates'
import { expandOccurrences, nextDueOccurrence, ruleDates, splitSeriesFrom } from '../recurrence'
import type { Bill, BillOccurrence, Recurrence } from '../types'

const bill = (rule: Recurrence, extra: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  name: 'Rent',
  amount: 50000,
  rule,
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...extra,
})
const dates = (b: Bill, from: string, to: string, o: BillOccurrence[] = []) =>
  expandOccurrences(b, from, to, o).map((x) => x.date)

describe('expandOccurrences: rules', () => {
  it.each<[string, Recurrence, string, string, string[]]>([
    [
      'once inside',
      { freq: 'once', date: '2026-03-05' },
      '2026-03-01',
      '2026-04-01',
      ['2026-03-05'],
    ],
    [
      'once outside (to is exclusive)',
      { freq: 'once', date: '2026-04-01' },
      '2026-03-01',
      '2026-04-01',
      [],
    ],
    [
      'weekly',
      { freq: 'weekly', interval: 1, anchor: '2026-01-05' },
      '2026-01-01',
      '2026-01-27',
      ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26'],
    ],
    [
      'weekly interval 2, window mid-series',
      { freq: 'weekly', interval: 2, anchor: '2026-01-05' },
      '2026-01-20',
      '2026-03-01',
      ['2026-02-02', '2026-02-16'],
    ],
    [
      'weekly never before its anchor',
      { freq: 'weekly', interval: 1, anchor: '2026-06-01' },
      '2026-05-01',
      '2026-06-09',
      ['2026-06-01', '2026-06-08'],
    ],
    [
      'Jan 31 monthly clamps from the anchor, not the previous date',
      { freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-31' },
      '2026-01-01',
      '2026-06-01',
      ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'],
    ],
    [
      'Jan 31 monthly in a leap year',
      { freq: 'monthly', interval: 1, day: 31, anchor: '2024-01-31' },
      '2024-02-01',
      '2024-04-01',
      ['2024-02-29', '2024-03-31'],
    ],
    [
      'monthly interval 2',
      { freq: 'monthly', interval: 2, day: 15, anchor: '2026-01-15' },
      '2026-01-01',
      '2026-08-01',
      ['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15'],
    ],
    [
      'monthly interval 3 crossing a year, window far from anchor',
      { freq: 'monthly', interval: 3, day: 10, anchor: '2025-11-10' },
      '2027-01-01',
      '2027-12-31',
      ['2027-02-10', '2027-05-10', '2027-08-10', '2027-11-10'],
    ],
    [
      'monthly day before the anchor day starts next month',
      { freq: 'monthly', interval: 1, day: 5, anchor: '2026-01-20' },
      '2026-01-01',
      '2026-03-01',
      ['2026-02-05'],
    ],
    [
      'monthly last day',
      { freq: 'monthly', interval: 1, day: 'last', anchor: '2026-01-01' },
      '2026-01-01',
      '2026-04-01',
      ['2026-01-31', '2026-02-28', '2026-03-31'],
    ],
    [
      'yearly Feb 29 -> Feb 28 on non-leap years',
      { freq: 'yearly', month: 2, day: 29 },
      '2024-01-01',
      '2029-01-01',
      ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29'],
    ],
    [
      'yearly with start',
      { freq: 'yearly', month: 6, day: 1, start: '2027-01-01' },
      '2025-01-01',
      '2029-01-01',
      ['2027-06-01', '2028-06-01'],
    ],
  ])('%s', (_l, rule, from, to, expected) => {
    expect(dates(bill(rule), from, to)).toEqual(expected)
  })

  it('returns nothing for an empty window', () => {
    expect(dates(bill({ freq: 'once', date: '2026-01-01' }), '2026-01-02', '2026-01-01')).toEqual(
      [],
    )
  })

  it('treats a bad interval as 1', () => {
    expect(
      ruleDates({ freq: 'weekly', interval: 0, anchor: '2026-01-05' }, '2026-01-05', '2026-01-13'),
    ).toEqual(['2026-01-05', '2026-01-12'])
  })
})

describe('until (inclusive)', () => {
  const rule: Recurrence = { freq: 'monthly', interval: 1, day: 10, anchor: '2026-01-10' }
  it.each([
    ['2026-03-10', ['2026-01-10', '2026-02-10', '2026-03-10']],
    ['2026-03-09', ['2026-01-10', '2026-02-10']],
    ['2026-01-09', []],
    ['2026-01-10', ['2026-01-10']],
  ])('until %s', (until, expected) => {
    expect(dates(bill(rule, { until }), '2026-01-01', '2026-12-31')).toEqual(expected)
  })
})

describe('occurrence overrides', () => {
  const rule: Recurrence = { freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-31' }
  const ov = (
    o: Partial<BillOccurrence> & Pick<BillOccurrence, 'originalDate' | 'status'>,
  ): BillOccurrence => ({
    id: `b1|${o.originalDate}`,
    billId: 'b1',
    ...o,
  })

  it('a moved occurrence appears at its new date, keyed by the original', () => {
    const moved = ov({ originalDate: '2026-01-31', status: 'moved', movedTo: '2026-02-02' })
    const out = expandOccurrences(bill(rule), '2026-02-01', '2026-03-01', [moved])
    expect(out.map((o) => [o.originalDate, o.date, o.status, o.moved])).toEqual([
      ['2026-01-31', '2026-02-02', 'due', true],
      ['2026-02-28', '2026-02-28', 'due', false],
    ])
  })

  it('a moved occurrence leaves its original window', () => {
    const moved = ov({ originalDate: '2026-02-28', status: 'moved', movedTo: '2026-03-02' })
    expect(dates(bill(rule), '2026-02-01', '2026-03-01', [moved])).toEqual([])
  })

  it('moved past until still shows (until limits original dates)', () => {
    const moved = ov({ originalDate: '2026-02-28', status: 'moved', movedTo: '2026-03-05' })
    expect(dates(bill(rule, { until: '2026-03-01' }), '2026-03-01', '2026-04-01', [moved])).toEqual(
      ['2026-03-05'],
    )
  })

  it('skipped stays visible with status skipped', () => {
    const out = expandOccurrences(bill(rule), '2026-02-01', '2026-03-01', [
      ov({ originalDate: '2026-02-28', status: 'skipped' }),
    ])
    expect(out[0]?.status).toBe('skipped')
  })

  it('paid amount is history; amountOverride applies to due ones', () => {
    const out = expandOccurrences(bill(rule), '2026-01-01', '2026-04-01', [
      ov({ originalDate: '2026-01-31', status: 'paid', paidAmount: 48000 }),
      ov({
        originalDate: '2026-02-28',
        status: 'moved',
        movedTo: '2026-02-27',
        amountOverride: 51000,
      }),
    ])
    expect(out.map((o) => o.amount)).toEqual([48000, 51000, 50000])
  })

  it('ignores overrides of other bills', () => {
    const other = { ...ov({ originalDate: '2026-02-28', status: 'skipped' }), billId: 'b2' }
    expect(expandOccurrences(bill(rule), '2026-02-01', '2026-03-01', [other])[0]?.status).toBe(
      'due',
    )
  })

  it('nextDueOccurrence skips paid and skipped', () => {
    const next = nextDueOccurrence(bill(rule), '2026-01-01', [
      ov({ originalDate: '2026-01-31', status: 'paid' }),
      ov({ originalDate: '2026-02-28', status: 'skipped' }),
    ])
    expect(next?.date).toBe('2026-03-31')
    expect(nextDueOccurrence(bill({ freq: 'once', date: '2025-01-01' }), '2026-01-01')).toBeNull()
  })
})

describe('splitSeriesFrom (RFC 5545 "this and following")', () => {
  it('ends the old series the day before and re-anchors the new one', () => {
    const b = bill({ freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-31' })
    const { before, after } = splitSeriesFrom(b, '2026-02-28', 'b2')
    expect(before).toEqual({ ...b, until: '2026-02-27' })
    expect(after?.id).toBe('b2')
    expect(after?.rule).toEqual({ freq: 'monthly', interval: 1, day: 31, anchor: '2026-02-28' })
    // Re-anchoring on a clamped date keeps day 31, so March is still the 31st.
    expect(dates(after!, '2026-01-01', '2026-05-01')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('splitting at the first occurrence leaves no old series', () => {
    const b = bill({ freq: 'weekly', interval: 1, anchor: '2026-01-05' })
    expect(splitSeriesFrom(b, '2026-01-05', 'b2').before).toBeNull()
  })

  it('keeps an earlier until and drops the new series when nothing is left', () => {
    const b = bill({ freq: 'weekly', interval: 1, anchor: '2026-01-05' }, { until: '2026-01-20' })
    expect(splitSeriesFrom(b, '2026-02-02', 'b2')).toEqual({ before: b, after: null })
  })

  it('once bills go to exactly one side', () => {
    const b = bill({ freq: 'once', date: '2026-03-05' })
    expect(splitSeriesFrom(b, '2026-03-05', 'b2')).toEqual({
      before: null,
      after: { ...b, id: 'b2' },
    })
    expect(splitSeriesFrom(b, '2026-03-06', 'b2')).toEqual({ before: b, after: null })
  })

  it('splitting between occurrences keeps the phase (weekly)', () => {
    // Mondays; split on a Wednesday must not turn the new series into Wednesdays.
    const b = bill({ freq: 'weekly', interval: 1, anchor: '2026-01-05' })
    const { before, after } = splitSeriesFrom(b, '2026-01-07', 'b2')
    expect(before?.until).toBe('2026-01-06')
    expect(after?.rule).toEqual({ freq: 'weekly', interval: 1, anchor: '2026-01-12' })
  })

  it('splitting between occurrences keeps the phase (every 2 months, clamped day)', () => {
    const b = bill({ freq: 'monthly', interval: 2, day: 31, anchor: '2026-01-31' })
    const { after } = splitSeriesFrom(b, '2026-02-10', 'b2')
    expect(dates(after!, '2026-01-01', '2026-08-01')).toEqual([
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
    ])
  })

  it('no old series when nothing occurred before the split, even after the anchor', () => {
    const b = bill({ freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-01' })
    expect(splitSeriesFrom(b, '2026-01-15', 'b2').before).toBeNull()
  })

  it('no new series when until ends between the split and the next occurrence', () => {
    const b = bill(
      { freq: 'monthly', interval: 1, day: 10, anchor: '2026-01-10' },
      { until: '2026-02-20' },
    )
    expect(splitSeriesFrom(b, '2026-02-15', 'b2')).toEqual({
      before: { ...b, until: '2026-02-14' },
      after: null,
    })
  })

  it('splitting before a series starts moves all of it to the new bill', () => {
    const b = bill({ freq: 'monthly', interval: 1, day: 'last', anchor: '2026-03-01' })
    const { before, after } = splitSeriesFrom(b, '2026-01-01', 'b2')
    expect(before).toBeNull()
    expect(dates(after!, '2026-01-01', '2026-05-01')).toEqual(['2026-03-31', '2026-04-30'])
  })

  it('yearly bills gain a start so the new series does not reach back', () => {
    const b = bill({ freq: 'yearly', month: 2, day: 29 })
    const { before, after } = splitSeriesFrom(b, '2027-02-28', 'b2')
    expect(before?.until).toBe('2027-02-27')
    expect(dates(after!, '2024-01-01', '2029-01-01')).toEqual(['2027-02-28', '2028-02-29'])
  })
})

const isoDate = fc
  .integer({ min: toDayNumber('2000-01-01'), max: toDayNumber('2060-12-31') })
  .map(fromDayNumber)
const recurrence: fc.Arbitrary<Recurrence> = fc.oneof(
  isoDate.map((date) => ({ freq: 'once' as const, date })),
  fc
    .tuple(fc.integer({ min: 1, max: 6 }), isoDate)
    .map(([interval, anchor]) => ({ freq: 'weekly' as const, interval, anchor })),
  fc
    .tuple(
      fc.integer({ min: 1, max: 12 }),
      fc.oneof(fc.integer({ min: 1, max: 31 }), fc.constant('last' as const)),
      isoDate,
    )
    .map(([interval, day, anchor]) => ({ freq: 'monthly' as const, interval, day, anchor })),
  fc
    .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
    .map(([month, day]) => ({ freq: 'yearly' as const, month, day })),
)

describe('recurrence properties', () => {
  it('occurrences are sorted, unique and inside [from, to)', () => {
    fc.assert(
      fc.property(recurrence, isoDate, fc.integer({ min: 0, max: 800 }), (rule, from, len) => {
        const to = addDays(from, len)
        const out = expandOccurrences(bill(rule), from, to)
        const originals = new Set(out.map((o) => o.originalDate))
        return (
          originals.size === out.length &&
          out.every(
            (o, i) => o.date >= from && o.date < to && (i === 0 || out[i - 1]!.date <= o.date),
          )
        )
      }),
    )
  })

  it('expanding two adjacent windows equals expanding their union', () => {
    fc.assert(
      fc.property(
        recurrence,
        isoDate,
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 400 }),
        (rule, a, l1, l2) => {
          const b = addDays(a, l1)
          const c = addDays(b, l2)
          const whole = dates(bill(rule), a, c)
          return (
            JSON.stringify([...dates(bill(rule), a, b), ...dates(bill(rule), b, c)]) ===
            JSON.stringify(whole)
          )
        },
      ),
    )
  })

  it('splitting at any date keeps the same dates overall', () => {
    fc.assert(
      fc.property(recurrence, isoDate, (rule, at) => {
        const b = bill(rule)
        const from = '1999-01-01'
        const to = '2070-01-01'
        const { before, after } = splitSeriesFrom(b, at, 'b2')
        const left = before ? dates(before, from, to) : []
        const right = after ? dates(after, from, to) : []
        return (
          left.every((d) => d < at) &&
          right.every((d) => d >= at) &&
          JSON.stringify([...left, ...right]) === JSON.stringify(dates(b, from, to))
        )
      }),
    )
  })

  it('splitting at an occurrence keeps the same dates overall', () => {
    fc.assert(
      fc.property(recurrence, fc.nat({ max: 30 }), (rule, pick) => {
        const b = bill(rule)
        const from = '1999-01-01'
        const to = '2070-01-01'
        const all = dates(b, from, to)
        const at = all[Math.min(pick, all.length - 1)]
        if (!at) return true
        const { before, after } = splitSeriesFrom(b, at, 'b2')
        const joined = [
          ...(before ? dates(before, from, to) : []),
          ...(after ? dates(after, from, to) : []),
        ]
        return JSON.stringify(joined) === JSON.stringify(all)
      }),
    )
  })
})
