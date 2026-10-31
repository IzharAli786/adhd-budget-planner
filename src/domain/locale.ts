// Locale -> sensible defaults for a fresh install (PLAN §8). Pure: the caller passes in
// navigator.language, and anything unknown falls back to the app defaults.
import { currencyDecimals, isSupportedCurrency } from './currencies'
import { DEFAULT_SETTINGS, type Settings, type WeekStart } from './settings'

const EURO = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK'.split(' ')

// Region -> currency for every currency in the fixed table (currencies.ts).
const OTHERS =
  'AE:AED AR:ARS AU:AUD BG:BGN BR:BRL CA:CAD CH:CHF CL:CLP CN:CNY CO:COP CZ:CZK DK:DKK ' +
  'EG:EGP GB:GBP HK:HKD HU:HUF ID:IDR IL:ILS IN:INR IS:ISK JP:JPY KE:KES KR:KRW KW:KWD ' +
  'MA:MAD MX:MXN MY:MYR NG:NGN NO:NOK NZ:NZD PH:PHP PK:PKR PL:PLN RO:RON RS:RSD SA:SAR ' +
  'SE:SEK SG:SGD TH:THB TR:TRY TW:TWD UA:UAH US:USD VN:VND ZA:ZAR'

const REGION_CURRENCY: Record<string, string> = {
  ...Object.fromEntries(EURO.map((r) => [r, 'EUR'])),
  ...Object.fromEntries(OTHERS.split(' ').map((pair) => pair.split(':'))),
}

// Where the week starts on Sunday (CLDR). Everyone else gets Monday, the EU default.
const SUNDAY_FIRST = new Set('US CA MX BR JP KR TW HK PH IL IN ZA AU'.split(' '))

/** "en-gb" or "en_GB" -> "en-GB"; null when it isn't a usable BCP 47 tag. */
export function canonicalLocale(tag: string | undefined): string | null {
  if (!tag) return null
  try {
    return Intl.getCanonicalLocales(tag.replace(/_/g, '-'))[0] ?? null
  } catch {
    return null
  }
}

const regionOf = (locale: string) => /-([A-Z]{2})(?:-|$)/.exec(locale)?.[1]

export function currencyForLocale(locale: string): string {
  const code = REGION_CURRENCY[regionOf(locale) ?? '']
  return code && isSupportedCurrency(code) ? code : DEFAULT_SETTINGS.currency
}

export function weekStartForLocale(locale: string): WeekStart {
  return SUNDAY_FIRST.has(regionOf(locale) ?? '') ? 0 : 1
}

/** Settings a fresh install starts with on a device set to `tag`. */
export function localeDefaults(
  tag: string | undefined,
): Pick<Settings, 'locale' | 'currency' | 'decimals' | 'weekStart'> {
  const locale = canonicalLocale(tag) ?? DEFAULT_SETTINGS.locale
  // A bare language ("de") says nothing about money; keep the defaults' currency then.
  const currency = currencyForLocale(locale)
  return {
    locale,
    currency,
    decimals: currencyDecimals(currency),
    weekStart: regionOf(locale) ? weekStartForLocale(locale) : DEFAULT_SETTINGS.weekStart,
  }
}
