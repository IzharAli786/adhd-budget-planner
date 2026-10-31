import { describe, expect, it } from 'vitest'
import { formatMoney, parseAmount } from '../money'

describe('parseAmount', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['12.05', 1205],
    ['0.1', 10],
    [' 7 ', 700],
    ['0', 0],
  ])('parses %j as %i cents', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', 'abc', '1.250', '-5', '1,000.00', '12.'])('rejects %j', (input) => {
    expect(parseAmount(input)).toBeNull()
  })

  it('respects zero-decimal currencies', () => {
    expect(parseAmount('500', 0)).toBe(500)
    expect(parseAmount('500.5', 0)).toBeNull()
  })
})

describe('formatMoney', () => {
  it('formats cents as currency', () => {
    expect(formatMoney(1250)).toBe('€12.50')
  })
})
