import type { ReactNode } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/**
 * Status tones (app.css --tone-*): what state something is in. Never which envelope
 * (that is --env-*) and never "you can act on this" (that is --accent).
 */
export type Tone = 'neutral' | 'progress' | 'success' | 'attention' | 'info'

/** Soft fill, tone text and a decorative tone ring (needs `ring-1`). */
export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-tone-neutral-bg text-tone-neutral ring-tone-neutral-line',
  progress: 'bg-tone-progress-bg text-tone-progress ring-tone-progress-line',
  success: 'bg-tone-success-bg text-tone-success ring-tone-success-line',
  attention: 'bg-tone-attention-bg text-tone-attention ring-tone-attention-line',
  info: 'bg-tone-info-bg text-tone-info ring-tone-info-line',
}

/** Tone text alone, for a status word in a line of copy ("$4 over"). */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-tone-neutral',
  progress: 'text-tone-progress',
  success: 'text-tone-success',
  attention: 'text-tone-attention',
  info: 'text-tone-info',
}

interface BadgeProps {
  tone?: Tone
  icon?: IconName
  /** sm (24px, 12px glyph) in rows; md (28px, 14px glyph) where it stands alone. */
  size?: 'sm' | 'md'
  children: ReactNode
  /** Layout only (margin, self-alignment). */
  className?: string
}

/**
 * The one status pill. Not interactive: when it must be tapped, wrap it in a 44px button
 * with `group` and give the badge `group-hover:brightness-95`. The text node is exactly
 * the label, so getByText('In progress') finds it; the glyph is aria-hidden.
 */
export function Badge({ tone = 'neutral', icon, size = 'sm', children, className }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full text-xs leading-none font-semibold whitespace-nowrap ring-1 ring-inset',
        size === 'sm'
          ? cx('h-6 gap-1', icon ? 'pr-2.5 pl-2' : 'px-2.5')
          : cx('h-7 gap-1.5', icon ? 'pr-3 pl-2.5' : 'px-3'),
        TONE_SOFT[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 12 : 14} className="shrink-0" />}
      {children}
    </span>
  )
}
