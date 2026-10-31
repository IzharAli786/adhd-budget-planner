import type { ReactNode } from 'react'
import { cx } from './cx'

/**
 * A hero amount that always fits its card, at any text size (PLAN §8: 150% at 390px).
 * The wrapper is a size container, so the font is capped by the card's own width (cqi),
 * not the viewport: 100% text and 150% text both end up as large as fits, never wider.
 * Tabular digits are about 0.6em wide, so `chars` characters need about 0.62em each.
 */
export function BigNumber({
  text,
  maxRem = 4.5,
  suffix,
  className,
}: {
  text: string
  maxRem?: number
  /** A word after the number ("short"), smaller and allowed to wrap below it. */
  suffix?: ReactNode
  className?: string
}) {
  const perChar = 100 / (0.62 * Math.max(text.length, 3))
  return (
    <div className="@container">
      <p
        aria-live="polite"
        className={cx(
          'leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums',
          className,
        )}
        style={{ fontSize: `min(${maxRem}rem, ${perChar.toFixed(2)}cqi)` }}
      >
        {text}
        {suffix && (
          <span className="text-[0.4em] font-medium tracking-normal whitespace-normal text-muted">
            {' '}
            {suffix}
          </span>
        )}
      </p>
    </div>
  )
}
