import { describe, expect, it } from 'vitest'
import {
  currencySymbol,
  dateTimeFormat,
  displayNames,
  intlCacheSize,
  numberFormat,
  pluralRules,
  relativeTimeFormat,
} from '../intl'
import { formatMoney } from '../money'

describe('cached Intl factory', () => {
  it('builds each formatter once per locale and options', () => {
    const a = numberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    const b = numberFormat('de-DE', { style: 'currency', currency: 'EUR' })
    expect(a).toBe(b)
    expect(numberFormat('fr-FR', { style: 'currency', currency: 'EUR' })).not.toBe(a)
    expect(numberFormat('de-DE', { style: 'currency', currency: 'USD' })).not.toBe(a)
    expect(dateTimeFormat('en-GB', { month: 'long' })).toBe(
      dateTimeFormat('en-GB', { month: 'long' }),
    )
    expect(relativeTimeFormat('en')).toBe(relativeTimeFormat('en'))
    expect(pluralRules('en', { type: 'ordinal' })).toBe(pluralRules('en', { type: 'ordinal' }))
    expect(displayNames('en', { type: 'currency' })).toBe(displayNames('en', { type: 'currency' }))
  })

  it('formatMoney reuses the cache instead of building a formatter per call', () => {
    formatMoney(1250, 'GBP', 'en-GB', 2)
    const size = intlCacheSize()
    for (let i = 0; i < 50; i++) formatMoney(i * 100, 'GBP', 'en-GB', 2)
    expect(intlCacheSize()).toBe(size)
  })

  it('falls back to the default locale for a broken tag instead of throwing', () => {
    expect(() => numberFormat('not a locale!')).not.toThrow()
    expect(numberFormat('not a locale!').resolvedOptions().locale).toBe('en-IE')
    expect(formatMoney(1250, 'EUR', 'x!y', 2)).toBe('€12.50')
  })

  it('formats money in the locale’s own style', () => {
    expect(formatMoney(123456, 'EUR', 'en-IE', 2)).toBe('€1,234.56')
    expect(formatMoney(123456, 'EUR', 'de-DE', 2)).toBe('1.234,56 €')
    expect(formatMoney(1250, 'JPY', 'ja-JP', 0)).toBe('￥1,250')
  })

  it('knows the symbol people expect next to an amount', () => {
    expect(currencySymbol('en-IE', 'EUR')).toBe('€')
    expect(currencySymbol('en-GB', 'GBP')).toBe('£')
    expect(currencySymbol('de-CH', 'CHF')).toBe('CHF')
  })
})
