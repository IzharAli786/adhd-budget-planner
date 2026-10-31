// Minor-unit decimals per ISO 4217. Fixed in code instead of read from Intl because
// browsers ship different ICU data (e.g. ISK, HUF, CLP disagree between engines),
// and a stored amount must mean the same thing on every device.
export const CURRENCY_DECIMALS = {
  AED: 2,
  ARS: 2,
  AUD: 2,
  BGN: 2,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CLP: 0,
  CNY: 2,
  COP: 2,
  CZK: 2,
  DKK: 2,
  EGP: 2,
  EUR: 2,
  GBP: 2,
  HKD: 2,
  HUF: 2,
  IDR: 2,
  ILS: 2,
  INR: 2,
  ISK: 0,
  JPY: 0,
  KES: 2,
  KRW: 0,
  KWD: 3,
  MAD: 2,
  MXN: 2,
  MYR: 2,
  NGN: 2,
  NOK: 2,
  NZD: 2,
  PHP: 2,
  PKR: 2,
  PLN: 2,
  RON: 2,
  RSD: 2,
  SAR: 2,
  SEK: 2,
  SGD: 2,
  THB: 2,
  TRY: 2,
  TWD: 2,
  UAH: 2,
  USD: 2,
  VND: 0,
  ZAR: 2,
} as const satisfies Record<string, number>

export type CurrencyCode = keyof typeof CURRENCY_DECIMALS

export const CURRENCY_CODES = Object.keys(CURRENCY_DECIMALS).sort() as CurrencyCode[]

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return Object.hasOwn(CURRENCY_DECIMALS, code)
}

/** Decimals for a currency; unknown codes fall back to 2, the ISO 4217 majority. */
export function currencyDecimals(code: string): number {
  return isSupportedCurrency(code) ? CURRENCY_DECIMALS[code] : 2
}
