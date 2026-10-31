import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/** An inset grouped list, the iOS Settings pattern people already know. */
export function ListGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && (
        <h2 className="px-1 text-xs font-semibold tracking-wider text-muted uppercase">{title}</h2>
      )}
      <ul className="divide-y divide-line overflow-hidden rounded-[1.5rem] bg-surface shadow-card ring-1 ring-line">
        {children}
      </ul>
    </section>
  )
}

interface RowProps {
  icon?: IconName
  label: ReactNode
  detail?: ReactNode
  /** Internal route; renders a link with a chevron. */
  to?: string
  onClick?: () => void
  /** Custom control on the right (a switch, a button). */
  trailing?: ReactNode
}

const rowClass = 'flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5 text-left'

export function ListRow({ icon, label, detail, to, onClick, trailing }: RowProps) {
  const body = (
    <>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Icon name={icon} size={19} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        {detail && <span className="block text-sm text-muted">{detail}</span>}
      </span>
      {trailing}
      {(to || onClick) && !trailing && (
        <Icon name="chevron" size={18} className="shrink-0 text-muted" />
      )}
    </>
  )
  const interactive = 'transition-colors hover:bg-accent-soft/40 active:bg-accent-soft/70'
  return (
    <li>
      {to ? (
        <Link to={to} className={cx(rowClass, interactive)}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cx(rowClass, interactive)}>
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
    </li>
  )
}
