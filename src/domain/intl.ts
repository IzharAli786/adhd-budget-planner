// Cached Intl factory (PLAN §8). Building an Intl formatter is slow (it loads locale
// data); a list of 40 bills would otherwise build 40 identical ones on every render.
// One cache keyed by kind + locale + options means each formatter is built once.
//
// A bad locale tag (a hand-edited backup, an old browser) throws RangeError in every Intl
// constructor. We fall back to the app default instead of crashing the screen.

export const FALLBACK_LOCALE = 'en-IE'

type Kind = 'number' | 'date' | 'relative' | 'plural' | 'names'
const cache = new Map<string, unknown>()

function cached<T>(kind: Kind, locale: string, options: object, make: (l: string) => T): T {
  const key = `${kind}|${locale}|${JSON.stringify(options)}`
  let hit = cache.get(key) as T | undefined
  if (hit === undefined) {
    try {
      hit = make(locale)
    } catch {
      hit = make(FALLBACK_LOCALE)
    }
    cache.set(key, hit)
  }
  return hit
}

export const numberFormat = (locale: string, options: Intl.NumberFormatOptions = {}) =>
  cached('number', locale, options, (l) => new Intl.NumberFormat(l, options))

export const dateTimeFormat = (locale: string, options: Intl.DateTimeFormatOptions = {}) =>
  cached('date', locale, options, (l) => new Intl.DateTimeFormat(l, options))

export const relativeTimeFormat = (locale: string, options: Intl.RelativeTimeFormatOptions = {}) =>
  cached('relative', locale, options, (l) => new Intl.RelativeTimeFormat(l, options))

export const pluralRules = (locale: string, options: Intl.PluralRulesOptions = {}) =>
  cached('plural', locale, options, (l) => new Intl.PluralRules(l, options))

export const displayNames = (locale: string, options: Intl.DisplayNamesOptions) =>
  cached('names', locale, options, (l) => new Intl.DisplayNames(l, options))

/** "€", "£", "CHF": the symbol the locale writes next to an amount in this currency. */
export function currencySymbol(locale: string, currency: string): string {
  return (
    numberFormat(locale, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? currency
  )
}

/** For tests: how many formatters are cached. */
export const intlCacheSize = () => cache.size
