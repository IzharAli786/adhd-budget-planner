import { describe, expect, it } from 'vitest'
import { CURRENCY_CODES, currencyDecimals, isSupportedCurrency } from '../currencies'

describe('currencyDecimals', () => {
  it.each([
    ['EUR', 2],
    ['USD', 2],
    ['GBP', 2],
    ['JPY', 0],
    ['ISK', 0],
    ['KRW', 0],
    ['CLP', 0],
    ['HUF', 2],
    ['KWD', 3],
    ['CHF', 2],
    ['SEK', 2],
    ['NOK', 2],
    ['DKK', 2],
    ['PLN', 2],
    ['CZK', 2],
    ['CAD', 2],
    ['AUD', 2],
    ['NZD', 2],
    ['INR', 2],
  ])('%s has %i decimals', (code, decimals) => {
    expect(currencyDecimals(code)).toBe(decimals)
  })

  it('falls back to 2 for unknown codes', () => {
    expect(currencyDecimals('XYZ')).toBe(2)
    expect(isSupportedCurrency('XYZ')).toBe(false)
  })

  it('does not treat prototype keys as currencies', () => {
    expect(isSupportedCurrency('toString')).toBe(false)
  })

  it('ships at least 40 sorted, valid ISO codes', () => {
    expect(CURRENCY_CODES.length).toBeGreaterThanOrEqual(40)
    expect([...CURRENCY_CODES].sort()).toEqual(CURRENCY_CODES)
    for (const code of CURRENCY_CODES) expect(code).toMatch(/^[A-Z]{3}$/)
  })
})
