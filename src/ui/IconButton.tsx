import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type IconButtonTone = 'muted' | 'accent' | 'inverse' | 'danger'

interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'aria-label'
> {
  icon: IconName
  /** The accessible name (aria-label). Required: an icon alone says nothing to a reader. */
  label: string
  /** muted (default), accent, inverse (on the dark toast) or danger (quick delete). */
  tone?: IconButtonTone
  /** The target is always 44px; the glyph is 18 (sm, dense rows) or 20 (md). */
  size?: 'sm' | 'md'
}

const TONE: Record<IconButtonTone, string> = {
  muted: 'text-muted hover:bg-accent-soft/60 hover:text-text',
  accent: 'text-accent hover:bg-accent-soft/60',
  inverse: 'text-bg/80 hover:bg-bg/15 hover:text-bg',
  danger: 'text-muted hover:bg-tone-attention-bg hover:text-tone-attention',
}

/**
 * A round 44px icon-only button. "Can't go further" (period arrows) uses aria-disabled
 * so focus stays put; the caller then ignores the click.
 */
export const iconButtonClass = (tone: IconButtonTone = 'muted') =>
  cx(
    'inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
    'disabled:pointer-events-none disabled:opacity-40 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent',
    TONE[tone],
  )

/** One icon button for close, dismiss, prev/next, edit and quick delete. */
export function IconButton({
  icon,
  label,
  tone = 'muted',
  size = 'md',
  type = 'button',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cx(iconButtonClass(tone), className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 18 : 20} />
    </button>
  )
}
