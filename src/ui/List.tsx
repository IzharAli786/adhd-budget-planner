import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'
import { IconTile, type IconTileTone } from './IconTile'
import { SectionHeader } from './Section'

/** An inset grouped list, the iOS Settings pattern people already know. */
export function ListGroup({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      {title && <SectionHeader title={title} />}
      <ul className="card divide-y divide-line overflow-hidden">{children}</ul>
    </section>
  )
}

interface RowProps {
  icon?: IconName
  /** The icon tile's fill: accent (a place to go) by default, a tone when the row has one
      (paydays are always the success tone, as everywhere else). */
  iconTone?: IconTileTone
  label: ReactNode
  detail?: ReactNode
  /** Internal route; renders a link with a chevron. */
  to?: string
  onClick?: () => void
  /** Custom control on the right (a switch, a button). */
  trailing?: ReactNode
}

const rowClass = 'flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5 text-left'

export function ListRow({ icon, iconTone, label, detail, to, onClick, trailing }: RowProps) {
  const body = (
    <>
      {icon && <IconTile icon={icon} tone={iconTone} size="sm" />}
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
