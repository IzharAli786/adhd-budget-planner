import type { ReactNode } from 'react'
import { cx } from './cx'

export interface StripItem {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
}

/**
 * A row of two or three glanceable figures under a screen title (Plan, Goals). On phones
 * it is a short list (label left, figure right) so 150% text never squeezes three amounts
 * into a third of 390px each; from sm up the figures stand side by side.
 */
export function StatStrip({
  items,
  label,
  className,
}: {
  items: readonly StripItem[]
  label: string
  className?: string
}) {
  return (
    <section aria-label={label} className={cx('card-quiet', className)}>
      <dl
        className={cx(
          'grid divide-y divide-line sm:divide-x sm:divide-y-0',
          items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2',
        )}
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-3.5 sm:block sm:py-4"
          >
            <dt className="text-sm text-muted">{item.label}</dt>
            {/* Today's serif: a strip's figures read as figures, not as list text. */}
            <dd className="type-display text-[1.375rem] leading-tight sm:mt-1">{item.value}</dd>
            {item.hint && <dd className="w-full text-caption text-muted sm:mt-0.5">{item.hint}</dd>}
          </div>
        ))}
      </dl>
    </section>
  )
}
