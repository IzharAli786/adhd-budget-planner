import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  canonicalLocale,
  fallbackWeekStart,
  intlWeekStart,
  localeDefaults,
  weekStartForLocale,
} from '../locale'

describe('localeDefaults', () => {
  it.each([
    ['en-IE', { locale: 'en-IE', currency: 'EUR', decimals: 2, weekStart: 1 }],
    ['de-DE', { locale: 'de-DE', currency: 'EUR', decimals: 2, weekStart: 1 }],
    ['en-GB', { locale: 'en-GB', currency: 'GBP', decimals: 2, weekStart: 1 }],
    ['en-US', { locale: 'en-US', currency: 'USD', decimals: 2, weekStart: 0 }],
    ['ja-JP', { locale: 'ja-JP', currency: 'JPY', decimals: 0, weekStart: 0 }],
    // Intl's week data wins over the fallback table where the engine has it.
    [
      'is-IS',
      { locale: 'is-IS', currency: 'ISK', decimals: 0, weekStart: intlWeekStart('is-IS') ?? 1 },
    ],
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

describe('week start', () => {
  const proto = Intl.Locale.prototype as unknown as Record<string, unknown>
  const original = Object.getOwnPropertyDescriptor(proto, 'getWeekInfo')
  // Pretends to be an engine with only the older getter, or with no week data at all.
  function withoutGetWeekInfo(run: () => void) {
    Object.defineProperty(proto, 'getWeekInfo', { value: undefined, configurable: true })
    try {
      run()
    } finally {
      if (original) Object.defineProperty(proto, 'getWeekInfo', original)
      else delete proto.getWeekInfo
    }
  }
  const engineSays = (firstDay: number) =>
    vi
      .spyOn(
        Intl.Locale.prototype as unknown as { getWeekInfo: () => { firstDay: number } },
        'getWeekInfo',
      )
      .mockReturnValue({ firstDay })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads Intl week data (1 = Monday ... 7 = Sunday) as 0 = Sunday ... 6 = Saturday', () => {
    expect(intlWeekStart('en-US')).toBe(0)
    expect(intlWeekStart('de-DE')).toBe(1)
    expect(intlWeekStart('ar-EG')).toBe(6)
    expect(weekStartForLocale('en-GB')).toBe(1)
  })

  it('uses getWeekInfo() when the engine has the method', () => {
    engineSays(6)
    expect(intlWeekStart('en-IE')).toBe(6)
  })

  it('falls back to the older weekInfo getter', () => {
    withoutGetWeekInfo(() => {
      const had = Object.getOwnPropertyDescriptor(proto, 'weekInfo')
      Object.defineProperty(proto, 'weekInfo', {
        get: () => ({ firstDay: 7 }),
        configurable: true,
      })
      try {
        expect(intlWeekStart('de-DE')).toBe(0)
      } finally {
        if (had) Object.defineProperty(proto, 'weekInfo', had)
        else delete proto.weekInfo
      }
    })
  })

  it('uses the fallback table when the engine has no week data', () => {
    withoutGetWeekInfo(() => {
      const had = Object.getOwnPropertyDescriptor(proto, 'weekInfo')
      Object.defineProperty(proto, 'weekInfo', { get: () => undefined, configurable: true })
      try {
        expect(intlWeekStart('en-US')).toBeNull()
        expect(weekStartForLocale('en-US')).toBe(0)
        expect(weekStartForLocale('fr-FR')).toBe(1)
        expect(weekStartForLocale('ar-EG')).toBe(6)
      } finally {
        if (had) Object.defineProperty(proto, 'weekInfo', had)
        else delete proto.weekInfo
      }
    })
  })

  it('ignores nonsense from the engine', () => {
    engineSays(9)
    expect(intlWeekStart('en-US')).toBeNull()
    expect(weekStartForLocale('en-US')).toBe(0)
  })

  it.each([
    ['en-US', 0],
    ['ja-JP', 0],
    ['de-DE', 1],
    ['en-IE', 1],
    ['ar-KW', 6],
    ['de', 1],
  ])('fallback table: %s -> %i', (locale, want) => {
    expect(fallbackWeekStart(locale)).toBe(want)
  })
})
