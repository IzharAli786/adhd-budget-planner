/**
 * A slice's share of the whole, rounded on its own: 0.44% stays under 1%, 1.29% is 1%.
 *
 * Deliberately NOT largest-remainder rounding. Forcing the list to total exactly 100
 * pushes small slices up by a point to absorb the rounding (a $9.30 slice read "1%", the
 * same as one three times its size), which makes the chart look arbitrary. Each figure
 * here is the nearest whole percent of its own amount, so the list can total 99 or 101,
 * which is how money charts normally read.
 */
export function sharePercent(amount: number, total: number): number {
  if (total <= 0 || amount <= 0) return 0
  return Math.round((amount / total) * 100)
}

/** "25%", or "<1%" for money that is there but under half a percent: never "0%" for it. */
export function shareLabel(amount: number, total: number): string {
  if (amount <= 0 || total <= 0) return '0%'
  const pct = (amount / total) * 100
  return pct < 0.5 ? '<1%' : `${Math.round(pct)}%`
}
