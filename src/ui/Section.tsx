import type { ReactNode } from 'react'
import { cx } from './cx'

/** The one section header style: a small uppercase label, optional detail or action right. */
export function SectionHeader({
  title,
  id,
  aside,
  className,
}: {
  title: ReactNode
  id?: string
  /** A total, a link or a small button, aligned to the right. */
  aside?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex min-h-6 items-baseline justify-between gap-3 px-1', className)}>
      <h2 id={id} className="eyebrow text-muted">
        {title}
      </h2>
      {aside && <div className="text-caption text-muted tabular-nums">{aside}</div>}
    </div>
  )
}

/**
 * A number that settles in when it changes. Keyed on the text, so the DOM always holds
 * the final value (screen readers and tests never see an in-between number); only the
 * entrance animates, and app.css switches that off under reduced motion.
 */
export function AnimatedNumber({ value, className }: { value: string; className?: string }) {
  return (
    <span key={value} className={cx('animate-number tabular-nums', className)}>
      {value}
    </span>
  )
}
