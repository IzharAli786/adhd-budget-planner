import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean
}

/** A pill button. With `selected` it acts as a toggle and says so via aria-pressed. */
export function Chip({ selected, className, type = 'button', ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors',
        selected
          ? 'bg-accent text-accent-contrast'
          : 'bg-surface text-text ring-1 ring-line hover:bg-accent-soft/60',
        className,
      )}
      {...rest}
    />
  )
}
