import { describe, expect, it } from 'vitest'
import { shareLabel, sharePercent } from '../percents'

describe('sharePercent (each share rounded on its own)', () => {
  it('rounds each slice to its own nearest percent', () => {
    expect(sharePercent(2500, 10000)).toBe(25)
    expect(sharePercent(1, 3)).toBe(33)
    expect(sharePercent(2, 3)).toBe(67)
  })

  it('never inflates a small slice to make the list total 100', () => {
    // October in the sample data: $9.30 of $2,100.78 is 0.44%, and $27.05 is 1.29%.
    // Largest-remainder rounding showed both as "1%"; on their own they are 0 and 1.
    expect(sharePercent(930, 210078)).toBe(0)
    expect(sharePercent(2705, 210078)).toBe(1)
    expect(sharePercent(110000, 210078)).toBe(52)
  })

  it('is 0 when there is nothing to share', () => {
    expect(sharePercent(0, 100)).toBe(0)
    expect(sharePercent(5, 0)).toBe(0)
  })
})

describe('shareLabel', () => {
  it('says "<1%" for money that is there but under half a percent, never "0%"', () => {
    expect(shareLabel(930, 210078)).toBe('<1%')
    expect(shareLabel(4, 1000)).toBe('<1%')
  })

  it('shows the plain rounded percent otherwise', () => {
    expect(shareLabel(2705, 210078)).toBe('1%')
    expect(shareLabel(2500, 10000)).toBe('25%')
    expect(shareLabel(996, 1000)).toBe('100%')
  })

  it('says 0% only for nothing', () => {
    expect(shareLabel(0, 1000)).toBe('0%')
  })
})
