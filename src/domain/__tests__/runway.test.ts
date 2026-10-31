import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseQuickAdd, signedAmount } from '../quickAdd'
import { canFit, runway, spentLast7Days, spentOn } from '../runway'
import { planToday, type TodayInput } from '../today'
import type { Transaction } from '../types'

describe('runway (PLAN §4.2)', () => {
  it.each([
    // safe, spentToday, daysLeft -> perDay, leftToday
    [16100, 0, 7, 2300, 2300],
    [16100, 1000, 7, 2442, 1442], // allowance fixed at the start of the day: (16100+1000)/7
    [100, 0, 3, 33, 33], // floor, never rounds up
    [0, 0, 5, 0, 0],
    [-3800, 0, 5, 0, 0],
    [-500, 1000, 5, 100, -900], // 500 at the start of the day, then 1000 spent
    [5000, 0, 0, 5000, 5000], // daysLeft is at least 1
  ])('safe %i, spent %i, %i days -> %i per day, %i left', (safe, spent, days, perDay, left) => {
    const r = runway({ safeToSpend: safe, spentToday: spent, daysLeft: days, spentLast7Days: 0 })
    expect(r.perDay).toBe(perDay)
    expect(r.leftToday).toBe(left)
  })

  it('perDay never promises more than safe-to-spend over the days left', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000_000, max: 10_000_000 }),
        fc.integer({ min: 1, max: 62 }),
        (s, d) => {
          const r = runway({ safeToSpend: s, spentToday: 0, daysLeft: d, spentLast7Days: 0 })
          expect(r.perDay * d).toBeLessThanOrEqual(Math.max(0, s))
          expect(Number.isInteger(r.perDay)).toBe(true)
        },
      ),
    )
  })

  it('onTrack compares last week’s pace with the days left, without rounding', () => {
    const at = (safe: number, spent7: number, days: number) =>
      runway({ safeToSpend: safe, spentToday: 0, daysLeft: days, spentLast7Days: spent7 }).onTrack
    expect(at(6000, 7000, 7)).toBe(true) // 1000/day × 6 = 6000
    expect(at(5999, 7000, 7)).toBe(false)
    expect(at(0, 0, 1)).toBe(true)
  })
})

const tx = (extra: Partial<Transaction>): Transaction => ({
  id: 'x',
  date: '2026-11-04',
  amount: -500,
  note: '',
  createdAt: '2026-11-04T10:00:00.000Z',
  ...extra,
})

describe('spentOn / spentLast7Days', () => {
  it('counts only spending: not income, savings moves or bill payments', () => {
    const rows = [
      tx({ amount: -500 }),
      tx({ amount: 2000 }),
      tx({ amount: -700, fundId: 'f' }),
      tx({ amount: -900, billOccurrenceId: 'b|2026-11-01' }),
      tx({ amount: -300, date: '2026-11-03' }),
    ]
    expect(spentOn(rows, '2026-11-04')).toBe(500)
    expect(spentLast7Days(rows, '2026-11-04')).toBe(300)
    expect(spentLast7Days(rows, '2026-11-10')).toBe(800) // Nov 3..9
    expect(spentLast7Days(rows, '2026-11-11')).toBe(500) // Nov 3 has dropped out
  })
})

describe('canFit', () => {
  it.each([
    [16100, 7, 5000, true, 11100, 1585],
    [16100, 7, 16100, true, 0, 0],
    [16100, 7, 16101, false, -1, 0],
  ])('safe %i over %i days, buy %i', (total, daysLeft, x, fits, after, perDayAfter) => {
    expect(canFit(x, { total, spentToday: 0, daysLeft })).toEqual({ fits, after, perDayAfter })
  })
})

describe('acceptance: "12 coffee" (PLAN §10 M5)', () => {
  const checkIn = { at: '2026-11-04T08:00:00.000Z', date: '2026-11-04', balance: 84250 }
  const world: TodayInput = {
    today: '2026-11-04',
    incomes: [
      {
        id: 'pay',
        name: 'Salary',
        amount: 210000,
        schedule: { kind: 'monthly', day: 'last' },
        weekendRule: 'before',
        primary: true,
        active: true,
      },
    ],
    paydayOverrides: [],
    bills: [],
    occurrences: [],
    transactions: [],
    checkIn,
  }

  it('logs €12.00 and leftToday drops by exactly €12', () => {
    const parsed = parseQuickAdd('12 coffee', { today: world.today })
    if (!parsed.ok) throw new Error('did not parse')
    expect(signedAmount(parsed)).toBe(-1200)

    const before = planToday(world)
    const coffee = tx({ amount: signedAmount(parsed), note: parsed.note, date: parsed.date })
    const after = planToday({ ...world, transactions: [coffee] })
    if (before.kind !== 'ready' || after.kind !== 'ready') throw new Error('not ready')
    expect(after.runway.leftToday).toBe(before.runway.leftToday - 1200)
    expect(after.runway.perDay).toBe(before.runway.perDay)
  })

  it('any spend logged today lowers leftToday by exactly its amount', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50000, max: 200000 }),
        fc.integer({ min: 1, max: 100000 }),
        (balance, x) => {
          const w = { ...world, checkIn: { ...checkIn, balance } }
          const before = planToday(w)
          const after = planToday({ ...w, transactions: [tx({ amount: -x })] })
          if (before.kind !== 'ready' || after.kind !== 'ready') throw new Error('not ready')
          expect(after.runway.leftToday).toBe(before.runway.leftToday - x)
        },
      ),
    )
  })

  it('reports what is missing before there is a number', () => {
    expect(planToday({ ...world, incomes: [] }).kind).toBe('no-income')
    expect(
      planToday({
        ...world,
        incomes: [
          { ...world.incomes[0]!, schedule: { kind: 'irregular', expected: ['2026-10-01'] } },
        ],
      }).kind,
    ).toBe('no-payday')
    expect(planToday({ ...world, checkIn: undefined }).kind).toBe('no-balance')
  })
})
