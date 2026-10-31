// Money is always an integer number of minor units (cents), never a float.
// 0.1 + 0.2 === 0.30000000000000004 in JS, so floats drift; integers don't.
export type Cents = number

// Parses user input like "12", "12.5", "12,50" into cents without ever using parseFloat.
// Returns null for anything that isn't a plain amount (we ask the user instead of guessing).
export function parseAmount(input: string, decimals = 2): Cents | null {
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(input.trim())
  if (!match) return null
  const [, whole = '', frac = ''] = match
  if (frac.length > decimals) return null
  const cents = Number(whole) * 10 ** decimals + Number(frac.padEnd(decimals, '0') || '0')
  return Number.isSafeInteger(cents) ? cents : null
}

export function formatMoney(
  cents: Cents,
  currency = 'EUR',
  locale = 'en-IE',
  decimals = 2,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / 10 ** decimals)
}

/**
 * The same typed number in a currency with other decimals: "2500" stays 2500 when EUR
 * (2) becomes JPY (0), so 250000 cents become 2500 yen, not 250000.
 */
export function rescaleCents(cents: Cents, fromDecimals: number, toDecimals: number): Cents {
  return Math.round(cents * 10 ** (toDecimals - fromDecimals))
}
