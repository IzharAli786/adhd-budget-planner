import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { GARDEN_STAGES, gardenPoints, gardenStage, keptPoints } from '../garden'
import {
  countdownLabel,
  impulseState,
  msLeft,
  readyAt,
  readyItems,
  savedByWaiting,
  waitingItems,
} from '../impulse'
import { noSpendCount, noSpendStrip } from '../noSpend'
import {
  challengeStep,
  challengeTotal,
  challengeWeek,
  fundProgress,
  fundSaved,
  perPaydayToReach,
  reachedOn,
} from '../savings'
import type { ImpulseItem, Transaction } from '../types'

describe('garden', () => {
  it('counts outcomes, one check-in per day, never entries logged', () => {
    expect(
      gardenPoints({
        checkIns: [{ date: '2026-11-01' }, { date: '2026-11-01' }, { date: '2026-11-03' }],
        occurrences: [{ status: 'paid' }, { status: 'skipped' }, { status: 'moved' }],
        noSpend: [{ date: '2026-11-02' }, { date: '2026-11-04' }],
        impulse: [{ decision: 'skipped' }, { decision: 'bought' }, {}],
      }),
    ).toBe(2 + 1 + 2 + 1)
  })

  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [7, 1],
    [8, 2],
    [16, 3],
    [28, 4],
    [45, 5],
    [10_000, 5],
    [-4, 0],
  ])('%i points -> stage %i', (points, index) => {
    expect(gardenStage(points).index).toBe(index)
  })

  it('has about six stages and the last has nothing next', () => {
    expect(GARDEN_STAGES).toHaveLength(6)
    expect(gardenStage(45)).toMatchObject({ nextAt: null, progress: 1 })
    expect(gardenStage(5)).toMatchObject({ index: 1, nextAt: 8 })
    expect(gardenStage(5).progress).toBeCloseTo(2 / 5)
  })

  it('gardenStage is monotonic', () => {
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a]
        expect(gardenStage(lo).index).toBeLessThanOrEqual(gardenStage(hi).index)
      }),
    )
  })

  it('the shown points never go down', () => {
    expect(keptPoints(undefined, 4)).toBe(4)
    expect(keptPoints(9, 4)).toBe(9)
    expect(keptPoints(9, 12)).toBe(12)
  })
})

const fundTx = (amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: String(amount),
  date: '2026-11-04',
  amount,
  note: '',
  fundId: 'f',
  createdAt: '2026-11-04T10:00:00.000Z',
  ...extra,
})

describe('savings funds', () => {
  it('saved = opening + moves in − moves out, ignoring other funds and deleted rows', () => {
    const txs = [
      fundTx(-5000),
      fundTx(-2500),
      fundTx(1000), // taken back out
      fundTx(-9999, { fundId: 'other' }),
      fundTx(-7777, { deletedAt: '2026-11-04T11:00:00.000Z' }),
    ]
    expect(fundSaved({ id: 'f', openingSaved: 10000 }, txs)).toBe(16500)
  })

  it.each([
    [0, 10000, 0],
    [2500, 10000, 0.25],
    [12000, 10000, 1],
    [-100, 10000, 0],
    [500, undefined, 0],
    [500, 0, 0],
  ])('progress %i of %s is %d', (saved, target, p) => {
    expect(fundProgress(saved, target)).toBe(p)
  })

  it('52-week challenge: integers, €1 to €52, €1,378 in all', () => {
    expect(challengeTotal(100)).toBe(137800)
    expect(challengeWeek('2026-11-02', '2026-11-01')).toBe(0)
    expect(challengeWeek('2026-11-02', '2026-11-02')).toBe(1)
    expect(challengeWeek('2026-11-02', '2026-11-08')).toBe(1)
    expect(challengeWeek('2026-11-02', '2026-11-09')).toBe(2)
    expect(challengeWeek('2026-11-02', '2028-01-01')).toBe(52)
    expect(challengeStep('2026-11-02', '2026-11-16', 100)).toEqual({
      week: 3,
      thisWeek: 300,
      soFar: 600,
    })
    // JPY has no minor unit: the unit is 1 and amounts stay whole.
    expect(challengeStep('2026-11-02', '2026-11-16', 1).soFar).toBe(6)
  })

  it.each([
    // remaining, paydays left -> per payday
    [100000, 10, 10000],
    [100001, 10, 10001], // rounds up, so the target is reached
    [5000, 0, 5000], // no payday left: the whole rest
    [0, 5, null],
    [-10, 5, null],
  ])('pace: %i over %i paydays -> %s', (remaining, paydays, per) => {
    expect(perPaydayToReach(remaining, paydays)).toBe(per)
  })

  it('pace property: per payday × paydays always reaches the target', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000_000 }),
        fc.integer({ min: 1, max: 120 }),
        (r, n) => {
          const per = perPaydayToReach(r, n)!
          expect(per * n).toBeGreaterThanOrEqual(r)
          expect((per - 1) * n).toBeLessThan(r)
        },
      ),
    )
  })

  it('reachedOn picks the payday the target is reached', () => {
    const paydays = ['2026-11-30', '2026-12-31', '2027-01-29']
    expect(reachedOn(25000, 10000, paydays)).toBe('2027-01-29')
    expect(reachedOn(20000, 10000, paydays)).toBe('2026-12-31')
    expect(reachedOn(50000, 10000, paydays)).toBeNull()
    expect(reachedOn(5000, 0, paydays)).toBeNull()
    expect(reachedOn(0, 1000, paydays)).toBeNull()
  })
})

describe('48-hour list (clock injected)', () => {
  const added = '2026-11-02T09:30:00.000Z'
  const item = (extra: Partial<ImpulseItem> = {}): ImpulseItem => ({
    id: 'i',
    name: 'Headphones',
    amount: 8900,
    addedAt: added,
    ...extra,
  })
  const at = (hours: number) => new Date(Date.parse(added) + hours * 3_600_000).toISOString()

  it('waits exactly 48 hours, then asks', () => {
    expect(readyAt(item())).toBe('2026-11-04T09:30:00.000Z')
    expect(impulseState(item(), at(0))).toBe('waiting')
    expect(impulseState(item(), at(47.99))).toBe('waiting')
    expect(impulseState(item(), at(48))).toBe('ready')
    expect(impulseState(item(), at(200))).toBe('ready')
    expect(impulseState(item({ decision: 'skipped' }), at(200))).toBe('decided')
    expect(msLeft(item(), at(47))).toBe(3_600_000)
    expect(msLeft(item(), at(49))).toBe(0)
  })

  it('splits a list into waiting and ready, so expired ones can be decided together', () => {
    const items = [
      item({ id: 'a', addedAt: at(-60) }),
      item({ id: 'b', addedAt: at(-50) }),
      item({ id: 'c', addedAt: at(-10) }),
      item({ id: 'd', addedAt: at(-70), decision: 'bought' }),
    ]
    expect(readyItems(items, at(0)).map((i) => i.id)).toEqual(['a', 'b'])
    expect(waitingItems(items, at(0)).map((i) => i.id)).toEqual(['c'])
  })

  it('counts only skipped items as saved by waiting', () => {
    expect(
      savedByWaiting([
        item({ amount: 100, decision: 'skipped' }),
        item({ amount: 200, decision: 'bought' }),
        item({ amount: 400, decision: 'skipped' }),
        item({ amount: 800 }),
      ]),
    ).toBe(500)
  })

  it.each([
    [48, '2 days left'],
    [47.5, '1 d 23 h left'],
    [24, '1 day left'],
    [5.9, '5 h left'],
    [0.5, 'under an hour left'],
  ])('%d hours reads "%s"', (h, label) => {
    expect(countdownLabel(h * 3_600_000)).toBe(label)
  })
})

describe('no-spend days', () => {
  const days = [{ date: '2026-11-01' }, { date: '2026-11-03' }, { date: '2026-10-20' }]

  it('shows the last 7 days, oldest first', () => {
    const strip = noSpendStrip(days, '2026-11-04')
    expect(strip.map((d) => d.date)).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ])
    expect(strip.filter((d) => d.marked).map((d) => d.date)).toEqual(['2026-11-01', '2026-11-03'])
  })

  it('counts days in a range, inclusive', () => {
    expect(noSpendCount(days, '2026-11-01', '2026-11-30')).toBe(2)
    expect(noSpendCount(days, '2026-10-01', '2026-11-01')).toBe(2)
  })
})
