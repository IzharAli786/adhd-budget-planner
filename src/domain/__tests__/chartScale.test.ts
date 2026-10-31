import { describe, expect, it } from 'vitest'
import { niceMax } from '../chartScale'

describe('niceMax', () => {
  it.each([
    [0, 1],
    [-50, 1],
    [1, 1],
    [7, 10],
    [101, 200],
    [200, 200],
    [210_000, 250_000],
    [287_100, 500_000],
    [600_001, 1_000_000],
  ])('%d rounds up to %d', (value, expected) => {
    expect(niceMax(value)).toBe(expected)
  })

  it('never rounds down', () => {
    for (let v = 2; v < 100_000; v = Math.ceil(v * 1.37))
      expect(niceMax(v)).toBeGreaterThanOrEqual(v)
  })
})
