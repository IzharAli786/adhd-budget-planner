import { isPaletteColor } from '../domain/categories'
import { cx } from './cx'

/**
 * The CSS colour for an envelope's stored palette key. Everyday (stored as 'accent') and
 * rows from before colours existed get --env-everyday: its own hue, not the theme accent,
 * which sits right next to one of the palette colours in every theme.
 */
export const envelopeColor = (color: string | undefined) =>
  color && isPaletteColor(color) ? `var(--env-${color})` : 'var(--env-everyday)'

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

/** "● Groceries": a quiet label for a row, not a button. The same geometry as a Badge. */
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
        'inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-tone-neutral-bg px-2.5 text-xs font-medium text-text ring-1 ring-tone-neutral-line ring-inset',
        className,
      )}
    >
      <EnvelopeDot color={color} className="size-2" />
      <span className="truncate">{name}</span>
    </span>
  )
}
