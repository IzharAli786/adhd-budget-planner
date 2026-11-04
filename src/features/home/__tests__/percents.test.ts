import { describe, expect, it } from 'vitest'
import { percentLabel, percents } from '../percents'

describe('percents (largest remainder)', () => {
  it('always adds up to exactly 100', () => {
    expect(percents([1, 1, 1])).toEqual([34, 33, 33])
    expect(percents([1, 2])).toEqual([33, 67])
    expect(percents([2500, 7500])).toEqual([25, 75])
    for (const values of [
      [3, 3, 3, 3, 3, 3, 3],
      [1, 98, 1],
      [5, 7, 11, 13, 17],
    ])
      expect(percents(values).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('gives the spare points to the shares that lost the most to rounding', () => {
    // 12.5, 37.5, 50: one point to share; the first of the two equal remainders takes it.
    expect(percents([1, 3, 4])).toEqual([13, 37, 50])
    // 0.4 and 99.6: the bigger remainder (0.6) wins, so the tiny share rounds to 0.
    expect(percents([4, 996])).toEqual([0, 100])
  })

  it('is all zeros when there is nothing to share', () => {
    expect(percents([0, 0])).toEqual([0, 0])
    expect(percents([])).toEqual([])
  })
})

describe('percentLabel', () => {
  it('never says 0% for money that is there', () => {
    expect(percentLabel(4, 0)).toBe('<1%')
    expect(percentLabel(996, 100)).toBe('100%')
    expect(percentLabel(2500, 25)).toBe('25%')
  })

  it('says 0% only for nothing', () => {
    expect(percentLabel(0, 0)).toBe('0%')
  })
})
