import type { ReactNode } from 'react'
import type { Tone } from './Badge'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

export type NoticeTone = Tone | 'accent'

const SURFACE: Record<NoticeTone, string> = {
  accent: 'bg-accent-soft ring-line',
  neutral: 'bg-tone-neutral-bg ring-tone-neutral-line',
  progress: 'bg-tone-progress-bg ring-tone-progress-line',
  success: 'bg-tone-success-bg ring-tone-success-line',
  attention: 'bg-tone-attention-bg ring-tone-attention-line',
  info: 'bg-tone-info-bg ring-tone-info-line',
}
const GLYPH_COLOR: Record<NoticeTone, string> = {
  accent: 'text-accent',
  neutral: 'text-tone-neutral',
  progress: 'text-tone-progress',
  success: 'text-tone-success',
  attention: 'text-tone-attention',
  info: 'text-tone-info',
}
const DEFAULT_ICON: Record<NoticeTone, IconName> = {
  accent: 'info',
  neutral: 'info',
  progress: 'clock',
  success: 'check',
  attention: 'alert',
  info: 'info',
}

interface NoticeProps {
  tone?: NoticeTone
  /** Defaults by tone: attention alert, success check, progress clock, the rest info. */
  icon?: IconName
  /** 'alert' for an error the person must read now, 'status' for a quiet update. */
  role?: 'status' | 'alert'
  /** Right-hand slot: an IconButton dismiss or a text Button. */
  action?: ReactNode
  children: ReactNode
  /** Layout only (margin). */
  className?: string
}

/**
 * An in-flow message: a tinted box with the tone's glyph and the words in body text. The
 * text stays --text (every tone fill is 10:1 or better under it); the glyph carries the tone.
 */
export function Notice({ tone = 'info', icon, role, action, children, className }: NoticeProps) {
  return (
    <div
      role={role}
      className={cx(
        'flex items-start gap-3 rounded-2xl px-4 py-3 text-body text-text ring-1 ring-inset',
        SURFACE[tone],
        className,
      )}
    >
      <Icon
        name={icon ?? DEFAULT_ICON[tone]}
        size={20}
        className={cx('mt-0.5 shrink-0', GLYPH_COLOR[tone])}
      />
      <div className="min-w-0 flex-1">{children}</div>
      {/* Negative margins let a 44px target sit in a one-line notice without growing it. */}
      {action && <div className="-my-3 -mr-2 flex shrink-0 items-center self-center">{action}</div>}
    </div>
  )
}
