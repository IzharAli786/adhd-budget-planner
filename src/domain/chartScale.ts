// Axis maths for the charts: pure, so it is tested without a browser.

/**
 * The smallest "round" number at or above `value` (1, 2, 2.5 or 5 times a power of ten),
 * so a chart's top gridline reads "€3K" instead of "€2,871". Never below 1.
 */
export function niceMax(value: number): number {
  if (!(value > 1)) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= value) return step * pow
  return 10 * pow
}
