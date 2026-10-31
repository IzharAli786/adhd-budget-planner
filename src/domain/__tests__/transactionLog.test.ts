import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { savingsOnPaydays } from '../savings'
import {
  ALL_TIME,
  filterLog,
  logYears,
  logTotals,
  monthRange,
  newestFirst,
  payPeriods,
  yearMonths,
  type LogRange,
} from '../transactionLog'
import type { IncomeSource, SavingsFund, Transaction } from '../types'

const income: IncomeSource = {
  id: 'pay',
  name: 'Pay',
  amount: 200000,
  schedule: { kind: 'biweekly', anchor: '2026-10-23' },
  weekendRule: 'before',
  primary: true,
  active: true,
}

let seq = 0
const tx = (over: Partial<Transaction>): Transaction => ({
  id: `t${seq++}`,
  date: '2026-11-02',
  amount: -100,
  note: '',
  createdAt: '2026-11-02T09:00:00.000Z',
  ...over,
})

describe('payPeriods', () => {
  it('lists the current period and the ones before it, tiling with no gaps', () => {
    expect(payPeriods(income, '2026-11-04', [], 3)).toEqual([
      { kind: 'period', start: '2026-10-23', end: '2026-11-06' },
      { kind: 'period', start: '2026-10-09', end: '2026-10-23' },
      { kind: 'period', start: '2026-09-25', end: '2026-10-09' },
    ])
  })

  it('follows a moved payday', () => {
    const moved = [
      { id: 'pay|2026-10-23', incomeId: 'pay', originalDate: '2026-10-23', date: '2026-10-21' },
    ]
    expect(payPeriods(income, '2026-11-04', moved, 2)).toEqual([
      { kind: 'period', start: '2026-10-21', end: '2026-11-06' },
      { kind: 'period', start: '2026-10-09', end: '2026-10-21' },
    ])
  })

  it('is empty without an income, and starts today before the first irregular pay', () => {
    expect(payPeriods(undefined, '2026-11-04')).toEqual([])
    const irregular: IncomeSource = {
      ...income,
      schedule: { kind: 'irregular', expected: ['2026-11-20'] },
    }
    expect(payPeriods(irregular, '2026-11-04')).toEqual([
      { kind: 'period', start: '2026-11-04', end: '2026-11-20' },
    ])
    const none: IncomeSource = { ...income, schedule: { kind: 'irregular', expected: [] } }
    expect(payPeriods(none, '2026-11-04')).toEqual([])
  })

  it('never overlaps and always runs backwards, for any monthly payday', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 0, max: 700 }),
        (day, offset) => {
          const today = new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10)
          const monthly = { ...income, schedule: { kind: 'monthly', day } } as const
          const periods = payPeriods(monthly, today, [], 5)
          expect(periods).toHaveLength(5)
          expect(periods[0]!.start <= today && today < periods[0]!.end).toBe(true)
          for (let i = 1; i < periods.length; i++) {
            expect(periods[i]!.end).toBe(periods[i - 1]!.start)
            expect(periods[i]!.start < periods[i]!.end).toBe(true)
          }
        },
      ),
    )
  })
})

describe('months', () => {
  it('monthRange is the calendar month, end exclusive', () => {
    expect(monthRange('2026-02-14')).toEqual({
      kind: 'month',
      start: '2026-02-01',
      end: '2026-03-01',
    })
    expect(monthRange('2026-12-31')).toEqual({
      kind: 'month',
      start: '2026-12-01',
      end: '2027-01-01',
    })
  })

  it('logYears lists years with entries plus the current one, newest first', () => {
    expect(
      logYears(
        [tx({ date: '2024-09-03' }), tx({ date: '2026-11-01' }), tx({ date: '2024-01-30' })],
        '2026-12-02',
      ),
    ).toEqual(['2026', '2024'])
    expect(logYears([], '2026-12-02')).toEqual(['2026'])
  })

  it('yearMonths gives January up to this month this year, all twelve before', () => {
    const now = yearMonths('2026', '2026-03-15')
    expect(now.map((m) => m.start)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(now[2]).toEqual({ kind: 'month', start: '2026-03-01', end: '2026-04-01' })
    const past = yearMonths('2025', '2026-03-15')
    expect(past).toHaveLength(12)
    expect(past[11]).toEqual({ kind: 'month', start: '2025-12-01', end: '2026-01-01' })
  })
})

describe('filterLog', () => {
  const rows = [
    tx({ id: 'a', date: '2026-10-22', note: 'Lidl groceries', envelopeId: 'food' }),
    tx({ id: 'b', date: '2026-10-23', note: 'Coffee with Sam', envelopeId: 'fun' }),
    tx({ id: 'c', date: '2026-11-05', note: 'Café crème' }),
    tx({ id: 'd', date: '2026-11-06', note: 'Next period' }),
    tx({ id: 'e', date: '2026-10-25', note: 'Gone', deletedAt: '2026-10-26T00:00:00.000Z' }),
  ]
  const period: LogRange = { kind: 'period', start: '2026-10-23', end: '2026-11-06' }
  const ids = (out: Transaction[]) => out.map((t) => t.id)

  it.each<[string, Parameters<typeof filterLog>[1], string[]]>([
    ['the period, start in, end out', { range: period }, ['b', 'c']],
    ['all time, never deleted rows', { range: ALL_TIME }, ['a', 'b', 'c', 'd']],
    ['one envelope', { range: ALL_TIME, envelopeId: 'food' }, ['a']],
    ['no envelope', { range: ALL_TIME, envelopeId: 'none' }, ['c', 'd']],
    ['words in any order, any case', { range: ALL_TIME, query: 'sam COFFEE' }, ['b']],
    ['ignoring accents', { range: ALL_TIME, query: 'cafe creme' }, ['c']],
    ['a blank query', { range: period, query: '   ' }, ['b', 'c']],
    ['everything at once', { range: period, envelopeId: 'fun', query: 'cof' }, ['b']],
  ])('%s', (_, filter, expected) => {
    expect(ids(filterLog(rows, filter))).toEqual(expected)
  })

  it('a narrower filter never adds rows', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 4 }), fc.constantFrom('food', 'fun', 'none'), (q, e) => {
        const wide = filterLog(rows, { range: ALL_TIME, query: q })
        const narrow = filterLog(rows, { range: ALL_TIME, query: q, envelopeId: e })
        expect(narrow.every((t) => wide.includes(t))).toBe(true)
      }),
    )
  })
})

describe('logTotals and order', () => {
  it('counts and splits money in and out', () => {
    expect(logTotals([{ amount: -1250 }, { amount: 150000 }, { amount: -50 }])).toEqual({
      count: 3,
      in: 150000,
      out: 1300,
      inCount: 1,
      outCount: 2,
      averageOut: 650,
      averageIn: 150000,
    })
    expect(logTotals([])).toEqual({
      count: 0,
      in: 0,
      out: 0,
      inCount: 0,
      outCount: 0,
      averageOut: 0,
      averageIn: 0,
    })
  })

  it('averages round to whole cents and stay within the smallest and largest entry', () => {
    expect(logTotals([{ amount: -100 }, { amount: -101 }]).averageOut).toBe(101)
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -1e9, max: -1 }), { minLength: 1 }), (amounts) => {
        const { averageOut } = logTotals(amounts.map((amount) => ({ amount })))
        expect(averageOut).toBeGreaterThanOrEqual(-Math.max(...amounts))
        expect(averageOut).toBeLessThanOrEqual(-Math.min(...amounts))
      }),
    )
  })

  it('in - out is always the net of the amounts', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -1e9, max: 1e9 })), (amounts) => {
        const t = logTotals(amounts.map((amount) => ({ amount })))
        expect(t.in - t.out).toBe(amounts.reduce((a, b) => a + b, 0))
        expect(t.in).toBeGreaterThanOrEqual(0)
        expect(t.out).toBeGreaterThanOrEqual(0)
      }),
    )
  })

  it('newestFirst sorts by day, then by when it was entered', () => {
    const out = newestFirst([
      tx({ id: 'old', date: '2026-10-01' }),
      tx({ id: 'late', date: '2026-10-02', createdAt: '2026-10-02T20:00:00.000Z' }),
      tx({ id: 'early', date: '2026-10-02', createdAt: '2026-10-02T08:00:00.000Z' }),
    ])
    expect(out.map((t) => t.id)).toEqual(['late', 'early', 'old'])
  })
})

describe('savingsOnPaydays', () => {
  const fund = (over: Partial<SavingsFund>): SavingsFund => ({
    id: 'f',
    name: 'Holiday',
    perPeriod: 4000,
    openingSaved: 0,
    ...over,
  })
  const paydays = [
    { date: '2026-11-06', incomeId: 'pay' },
    { date: '2026-11-15', incomeId: 'gig' },
    { date: '2026-11-20', incomeId: 'pay' },
  ]

  it('marks the period income paydays with what each fund sets aside', () => {
    const out = savingsOnPaydays(
      paydays,
      [
        fund({}),
        fund({ id: 'z', name: 'Zero', perPeriod: 0 }),
        fund({ id: 'gone', deletedAt: '2026-10-01T00:00:00.000Z' }),
        fund({ id: 'done', name: 'Done', target: 1000, openingSaved: 1000 }),
        fund({ id: 'near', name: 'Near', target: 10000, perPeriod: 500 }),
      ],
      'pay',
      new Map([['near', 9000]]),
    )
    expect([...out.keys()]).toEqual(['2026-11-06', '2026-11-20'])
    expect(out.get('2026-11-06')).toEqual([
      { fundId: 'f', name: 'Holiday', amount: 4000 },
      { fundId: 'near', name: 'Near', amount: 500 },
    ])
  })

  it('a fund nearly at its target asks only for what is left', () => {
    const out = savingsOnPaydays(
      paydays,
      [fund({ target: 10000, perPeriod: 4000 })],
      'pay',
      new Map([['f', 9250]]),
    )
    expect(out.get('2026-11-06')).toEqual([{ fundId: 'f', name: 'Holiday', amount: 750 }])
  })

  it('is empty with no period income or no fund asking', () => {
    expect(savingsOnPaydays(paydays, [fund({})], undefined).size).toBe(0)
    expect(savingsOnPaydays(paydays, [], 'pay').size).toBe(0)
  })
})
