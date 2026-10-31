import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PaydayEntry } from '../bills'
import { periodIncome } from '../plan'
import { fundPace, savingsTotals } from '../savings'
import type { Transaction } from '../types'

const pay = (date: string, amount = 200000, name = 'Salary'): PaydayEntry => ({
  incomeId: name,
  name,
  amount,
  primary: true,
  nominal: date,
  date,
  overridden: false,
})

describe('periodIncome', () => {
  it.each([
    {
      why: 'first period: the payday before setup becomes the expected next pay',
      inPeriod: [pay('2026-10-30')],
      next: [pay('2026-11-30')],
      since: '2026-11-04',
      kind: 'expected',
      dates: ['2026-11-30'],
    },
    {
      why: 'a later period keeps the payday that started it',
      inPeriod: [pay('2026-11-30')],
      next: [pay('2026-12-31')],
      since: '2026-11-04',
      kind: 'received',
      dates: ['2026-11-30'],
    },
    {
      why: 'setup on payday itself counts that pay',
      inPeriod: [pay('2026-11-04')],
      next: [pay('2026-12-04')],
      since: '2026-11-04',
      kind: 'received',
      dates: ['2026-11-04'],
    },
    {
      why: 'a second income still coming this period is kept',
      inPeriod: [pay('2026-10-30'), pay('2026-11-15', 30000, 'Side job')],
      next: [pay('2026-11-30')],
      since: '2026-11-04',
      kind: 'received',
      dates: ['2026-11-15'],
    },
    {
      why: 'no balance yet: nothing to drop',
      inPeriod: [pay('2026-10-30')],
      next: [pay('2026-11-30')],
      since: undefined,
      kind: 'received',
      dates: ['2026-10-30'],
    },
    {
      why: 'nothing coming either: an empty received line',
      inPeriod: [pay('2026-10-30')],
      next: [],
      since: '2026-11-04',
      kind: 'received',
      dates: [],
    },
  ])('$why', ({ inPeriod, next, since, kind, dates }) => {
    const r = periodIncome(inPeriod, next, since)
    expect(r.kind).toBe(kind)
    expect(r.entries.map((e) => e.date)).toEqual(dates)
  })

  it('the total is always the sum of what it lists, never a payday before tracking', () => {
    const day = fc.integer({ min: 1, max: 28 }).map((d) => `2026-11-${String(d).padStart(2, '0')}`)
    fc.assert(
      fc.property(
        fc.array(fc.tuple(day, fc.integer({ min: 0, max: 1e7 }))),
        fc.array(fc.tuple(day, fc.integer({ min: 0, max: 1e7 }))),
        day,
        (a, b, since) => {
          const r = periodIncome(
            a.map(([d, n]) => pay(d, n)),
            b.map(([d, n]) => pay(d, n)),
            since,
          )
          expect(r.total).toBe(r.entries.reduce((s, e) => s + e.amount, 0))
          if (r.kind === 'received') for (const e of r.entries) expect(e.date >= since).toBe(true)
        },
      ),
    )
  })
})

describe('fundPace', () => {
  const paydays = ['2026-11-30', '2026-12-31', '2027-01-29', '2027-02-26']
  const today = '2026-11-04'
  it.each([
    { fund: { perPeriod: 0 }, saved: 0, want: null },
    { fund: { target: 1000, perPeriod: 0 }, saved: 1000, want: { kind: 'reached' } },
    {
      fund: { target: 1000, targetDate: '2027-01-31', perPeriod: 0 },
      saved: 100,
      want: { kind: 'by-date', perPayday: 300, by: '2027-01-31' },
    },
    // A target date in the past falls back to the fund's own pace.
    {
      fund: { target: 1000, targetDate: '2026-10-01', perPeriod: 400 },
      saved: 0,
      want: { kind: 'eta', when: '2027-01-29' },
    },
    { fund: { target: 1000, perPeriod: 0 }, saved: 0, want: null },
  ])('%#', ({ fund, saved, want }) => {
    expect(fundPace(fund, saved, today, paydays)).toEqual(want)
  })

  it('the per-payday amount always reaches the target by the date', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1e8 }),
        fc.integer({ min: 0, max: 1e8 }),
        fc.integer({ min: 0, max: 3 }),
        (target, saved, i) => {
          const by = paydays[i]!
          const pace = fundPace({ target, targetDate: by, perPeriod: 0 }, saved, today, paydays)
          if (saved >= target) {
            expect(pace).toEqual({ kind: 'reached' })
            return
          }
          if (pace?.kind !== 'by-date') throw new Error('expected a by-date pace')
          expect(saved + pace.perPayday * (i + 1)).toBeGreaterThanOrEqual(target)
        },
      ),
    )
  })
})

describe('savingsTotals', () => {
  const move = (fundId: string, amount: number): Transaction =>
    ({ id: `${fundId}${amount}`, fundId, amount: -amount, date: '2026-11-01' }) as Transaction
  it('adds every fund, and counts progress only up to each target', () => {
    const funds = [
      { id: 'a', openingSaved: 0, target: 1000 },
      { id: 'b', openingSaved: 5000, target: 1000 }, // overfilled: counts as 1000
      { id: 'c', openingSaved: 300 }, // no target
    ]
    const t = savingsTotals(funds, [move('a', 500)])
    expect(t).toEqual({ saved: 5800, target: 2000, progress: 0.75 })
  })

  it('progress stays within 0..1', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string(),
            openingSaved: fc.integer({ min: -1e6, max: 1e7 }),
            target: fc.option(fc.integer({ min: 0, max: 1e7 }), { nil: undefined }),
          }),
        ),
        (funds) => {
          const { progress } = savingsTotals(funds, [])
          expect(progress).toBeGreaterThanOrEqual(0)
          expect(progress).toBeLessThanOrEqual(1)
        },
      ),
    )
  })
})
