import { isPaletteColor } from '../domain/categories'
import { cx } from './cx'

/** The CSS colour for an envelope's stored palette key; Everyday follows the theme accent. */
export const envelopeColor = (color: string | undefined) =>
  color && isPaletteColor(color) ? `var(--env-${color})` : 'var(--accent)'

/** A small colour dot. Decorative: the envelope's name is always written next to it. */
export function EnvelopeDot({ color, className }: { color?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: envelopeColor(color) }}
    />
  )
}

/** "● Groceries": a quiet label for a row, not a button. */
export function EnvelopeLabel({
  name,
  color,
  className,
}: {
  name: string
  color?: string
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1.5 rounded-full bg-bg px-2 py-0.5 text-caption text-text ring-1 ring-line',
        className,
      )}
    >
      <EnvelopeDot color={color} className="h-2 w-2" />
      <span className="truncate">{name}</span>
    </span>
  )
}
