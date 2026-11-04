import type { Tone } from './Badge'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type IconTileTone = Tone | 'accent'

/** Tile fills: accent for "a place you can go", a tone when the tile states a status. */
export const ICON_TILE_TONE: Record<IconTileTone, string> = {
  accent: 'bg-accent-soft text-accent',
  neutral: 'bg-tone-neutral-bg text-tone-neutral',
  progress: 'bg-tone-progress-bg text-tone-progress',
  success: 'bg-tone-success-bg text-tone-success',
  attention: 'bg-tone-attention-bg text-tone-attention',
  info: 'bg-tone-info-bg text-tone-info',
}

interface IconTileProps {
  icon: IconName
  tone?: IconTileTone
  /** sm 36px (rows, cards), md 44px (choice cards, Backup); the glyph is 20 in both. */
  size?: 'sm' | 'md'
  /** A disc instead of a rounded square (the Goals card status disc). */
  round?: boolean
  /** Layout only (margin, self-alignment). */
  className?: string
}

/** The one icon-in-a-tile: list rows, help and backup cards, statuses beside a title. */
export function IconTile({
  icon,
  tone = 'accent',
  size = 'sm',
  round = false,
  className,
}: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-flex shrink-0 items-center justify-center',
        size === 'sm' ? 'size-9' : 'size-11',
        round ? 'rounded-full' : size === 'sm' ? 'rounded-xl' : 'rounded-2xl',
        ICON_TILE_TONE[tone],
        className,
      )}
    >
      <Icon name={icon} size={20} />
    </span>
  )
}
