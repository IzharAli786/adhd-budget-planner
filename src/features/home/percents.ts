/**
 * Whole-number percentages that add up to exactly 100 (largest remainder): each share is
 * rounded down, then the points left over go to the shares that lost the most.
 * [1, 1, 1] is [34, 33, 33], never [33, 33, 33] (99) or [34, 34, 34] (102).
 */
export function percents(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const out = raw.map(Math.floor)
  let left = 100 - out.reduce((a, b) => a + b, 0)
  // Ties keep their order, so the first of equal shares gets the extra point.
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i]! += 1
    left -= 1
  }
  return out
}

/** "25%", or "<1%" for money that is there but rounds to nothing: never "0%" for it. */
export const percentLabel = (amount: number, pct: number) =>
  amount > 0 && pct === 0 ? '<1%' : `${pct}%`
