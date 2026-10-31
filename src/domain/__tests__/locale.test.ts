import { describe, expect, it } from 'vitest'
import { canonicalLocale, localeDefaults } from '../locale'

describe('localeDefaults', () => {
  it.each([
    ['en-IE', { locale: 'en-IE', currency: 'EUR', decimals: 2, weekStart: 1 }],
    ['de-DE', { locale: 'de-DE', currency: 'EUR', decimals: 2, weekStart: 1 }],
    ['en-GB', { locale: 'en-GB', currency: 'GBP', decimals: 2, weekStart: 1 }],
    ['en-US', { locale: 'en-US', currency: 'USD', decimals: 2, weekStart: 0 }],
    ['ja-JP', { locale: 'ja-JP', currency: 'JPY', decimals: 0, weekStart: 0 }],
    ['is-IS', { locale: 'is-IS', currency: 'ISK', decimals: 0, weekStart: 1 }],
    ['en_gb', { locale: 'en-GB', currency: 'GBP', decimals: 2, weekStart: 1 }],
    ['zh-Hant-TW', { locale: 'zh-Hant-TW', currency: 'TWD', decimals: 2, weekStart: 0 }],
    // No region: keep the app's currency and week start
    ['de', { locale: 'de', currency: 'EUR', decimals: 2, weekStart: 1 }],
    // Unknown region or junk: defaults
    ['en-AQ', { locale: 'en-AQ', currency: 'EUR', decimals: 2, weekStart: 1 }],
    [undefined, { locale: 'en-IE', currency: 'EUR', decimals: 2, weekStart: 1 }],
    ['not a locale!', { locale: 'en-IE', currency: 'EUR', decimals: 2, weekStart: 1 }],
  ])('%s', (tag, want) => {
    expect(localeDefaults(tag)).toEqual(want)
  })

  it('canonicalLocale returns null for junk', () => {
    expect(canonicalLocale('')).toBeNull()
    expect(canonicalLocale('x!y')).toBeNull()
  })
})
