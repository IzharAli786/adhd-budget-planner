import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from './cx'
import { Icon } from './Icon'
import { Illustration, type IllustrationName } from './Illustration'

/** Screen title with an optional back link for nested screens (More > Settings). */
export function PageHeader({
  title,
  subtitle,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <header className="mb-7">
      {back && (
        <Link
          to={back.to}
          className="-ml-3 mb-1 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1.5 text-body font-medium text-accent hover:bg-accent-soft/60"
        >
          <Icon name="back" size={20} />
          {back.label}
        </Link>
      )}
      <h1 className="type-display text-title">{title}</h1>
      {subtitle && <p className="mt-1.5 text-body text-muted">{subtitle}</p>}
    </header>
  )
}

/**
 * An empty state: a small picture, what this place is for, and the one next step.
 * Empty states should explain, never just say "nothing".
 */
export function EmptyState({
  art,
  title,
  children,
  action,
  className,
}: {
  art: IllustrationName
  title: ReactNode
  children?: ReactNode
  /** The one next step (a button or link). */
  action?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cx(
        'card animate-rise-in flex flex-col items-center px-6 pt-8 pb-9 text-center',
        className,
      )}
    >
      <Illustration name={art} className="h-auto w-36" />
      <h2 className="mt-3 text-heading">{title}</h2>
      {children && <div className="mt-1 max-w-xs text-body text-muted">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </section>
  )
}
