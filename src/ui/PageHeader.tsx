import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from './Icon'

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
    <header className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="-ml-3 mb-1 inline-flex min-h-11 items-center gap-1 rounded-full pr-3 pl-1.5 text-[0.9375rem] font-medium text-accent hover:bg-accent-soft/60"
        >
          <Icon name="back" size={20} />
          {back.label}
        </Link>
      )}
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-[0.9375rem] text-muted">{subtitle}</p>}
    </header>
  )
}

/** A calm "coming soon" panel; empty states should explain, never just say "nothing". */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: ReactNode
  children?: ReactNode
}) {
  return (
    <section className="animate-fade-in flex flex-col items-center rounded-[1.75rem] bg-surface px-6 py-12 text-center shadow-card ring-1 ring-line">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        {icon}
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <div className="mt-1 max-w-xs text-[0.9375rem] text-muted">{children}</div>
    </section>
  )
}
