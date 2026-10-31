import type { ReactNode } from 'react'
import { cx } from './cx'

interface StatProps {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  size?: 'hero' | 'md' | 'sm'
  className?: string
}

/** A labelled number. Money values announce politely when they change (PLAN §8). */
export function Stat({ label, value, hint, size = 'md', className }: StatProps) {
  return (
    <div className={className}>
      <p className="text-sm text-muted">{label}</p>
      <p
        aria-live="polite"
        className={cx(
          'font-semibold tracking-tight tabular-nums',
          size === 'hero' && 'mt-1 text-[clamp(3rem,15vw,4.5rem)] leading-none',
          size === 'md' && 'mt-0.5 text-2xl',
          size === 'sm' && 'mt-0.5 text-lg',
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  )
}
