import { useId, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx'

interface SegmentedProps<T extends string | number> {
  label: string
  value: T
  /** `name` is the accessible name when the visible label isn't words (e.g. "A" sizes). */
  options: readonly { value: T; label: ReactNode; name?: string }[]
  onChange: (value: T) => void
}

/**
 * A radio group styled as a segmented control. Arrow keys move the choice, as with
 * native radios; only the selected option sits in the tab order (roving tabindex).
 */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const id = useId()
  const index = options.findIndex((o) => o.value === value)
  // A value from an older version or a backup may match no option; keep the group
  // reachable by Tab anyway by letting the first option take the tab stop.
  const tabStop = index === -1 ? 0 : index

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0
    if (!step) return
    e.preventDefault()
    const next = options[(tabStop + step + options.length) % options.length]!
    onChange(next.value)
    const el = document.getElementById(`${id}-${String(next.value)}`)
    el?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      // Wraps to a second row on narrow phones instead of squeezing labels ("2 weeks" broke
      // in two and "Yearly" was clipped at 360px with five options).
      className="flex flex-wrap gap-y-1 rounded-3xl bg-bg p-1 ring-1 ring-line"
    >
      {options.map((o, i) => {
        const selected = o.value === value
        return (
          <button
            key={String(o.value)}
            id={`${id}-${String(o.value)}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.name}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-11 flex-1 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors',
              selected
                ? 'bg-surface text-text shadow-card ring-1 ring-line'
                : 'text-muted hover:text-text',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
