import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
  /** Before the label while unselected, e.g. <EnvelopeDot color=… />. Decorative. */
  leading?: ReactNode
}

/**
 * A pill button. With `selected` it acts as a toggle and says so via aria-pressed. Selected
 * is accent-soft with an accent edge and a tick: solid accent is kept for primary buttons,
 * so a chosen "Today" never competes with "Log it".
 */
export function Chip({
  selected,
  leading,
  className,
  type = 'button',
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full text-sm transition-colors',
        selected
          ? 'bg-accent-soft pr-4 pl-3 font-semibold text-accent ring-[1.5px] ring-accent ring-inset'
          : 'bg-surface px-4 font-medium text-text ring-1 ring-line hover:bg-accent-soft/60',
        className,
      )}
      {...rest}
    >
      {selected ? <Icon name="check" size={16} className="shrink-0" /> : leading}
      {children}
    </button>
  )
}
