// Tap, hover or focus a chart column to read its numbers. The picture under it stays
// decorative; this layer is what keyboards and screen readers use: one button per column,
// named with every number in it, and a small tip that shows the same words on screen.
// The buttons tile the whole width, so a tap anywhere on the chart hits a column even
// when twelve narrow months share a phone screen.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { cx } from './cx'

export interface TipLine {
  label: string
  value: string
  /** A CSS colour for the little key next to the line. */
  color?: string
}

export interface ChartColumn {
  key: string
  /** The column's name in the tip and its button: "October 2026". */
  title: string
  lines: TipLine[]
  /** Centre of the column, 0 (left edge) to 1 (right edge). */
  at: number
}

/**
 * Closes a tapped-open tip when the next tap lands outside `ref`. Blur alone can't do it:
 * iOS Safari never focuses a tapped button, so there is no blur to hear.
 */
export function useDismissOnOutsideTap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  dismiss: () => void,
) {
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node | null)) dismiss()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [ref, active, dismiss])
}

export const columnLabel = (c: ChartColumn) =>
  `${c.title}: ${c.lines.map((l) => `${l.label} ${l.value}`).join(', ')}`

interface Props {
  columns: readonly ChartColumn[]
  /** Names the group of buttons: "Money in and out per month". */
  label: string
  /** Called with the column in focus or under the pointer, for a highlight in the chart. */
  onActive?: (index: number | null) => void
  className?: string
}

export function ChartTips({ columns, label, onActive, className }: Props) {
  // A tip shows for the column under a mouse, the one with keyboard focus, or the one
  // last tapped (iOS never focuses a tapped button). Tapping it again, Escape or leaving
  // the chart hides it.
  const [hover, setHover] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  // Roving tabindex: one Tab stop for the chart, arrows move between columns.
  const [current, setCurrent] = useState(Math.max(0, columns.length - 1))
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const group = useRef<HTMLDivElement>(null)
  const unpin = useCallback(() => {
    setPinned(null)
    setFocused(null)
  }, [])
  useDismissOnOutsideTap(group, pinned !== null, unpin)
  const shown = hover ?? pinned ?? focused
  const column = shown === null ? undefined : columns[shown]
  useEffect(() => onActive?.(shown), [shown, onActive])

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (e.key === 'Escape' && (pinned !== null || focused !== null)) {
      e.stopPropagation() // inside a sheet, Escape first closes the tip, not the sheet
      setPinned(null)
      setFocused(null)
      return
    }
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as const)[
      e.key as 'ArrowRight'
    ]
    const target =
      step !== undefined
        ? Math.min(columns.length - 1, Math.max(0, i + step))
        : e.key === 'Home'
          ? 0
          : e.key === 'End'
            ? columns.length - 1
            : null
    if (target === null) return
    e.preventDefault()
    refs.current[target]?.focus()
  }

  if (columns.length === 0) return null
  // Each button reaches halfway to its neighbours, so together they cover the width.
  const edges = columns.map((c, i) => {
    const prev = columns[i - 1]
    const next = columns[i + 1]
    return { from: prev ? (prev.at + c.at) / 2 : 0, to: next ? (c.at + next.at) / 2 : 1 }
  })

  return (
    <div
      ref={group}
      role="group"
      aria-label={label}
      className={cx('absolute inset-0', className)}
      onPointerLeave={() => setHover(null)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPinned(null)
          setFocused(null)
        }
      }}
    >
      {columns.map((c, i) => (
        <button
          key={c.key}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          tabIndex={i === Math.min(current, columns.length - 1) ? 0 : -1}
          aria-label={columnLabel(c)}
          onFocus={() => {
            setCurrent(i)
            setFocused(i)
          }}
          onClick={() => {
            const off = pinned === i
            setPinned(off ? null : i)
            if (off) setFocused(null)
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') setHover(i)
          }}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={cx(
            'absolute inset-y-0 rounded-lg outline-none',
            'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset',
            shown === i && 'bg-text/5',
          )}
          style={{
            left: `${edges[i]!.from * 100}%`,
            width: `${(edges[i]!.to - edges[i]!.from) * 100}%`,
          }}
        />
      ))}
      {column && (
        <div
          // The button already carries these words for screen readers.
          aria-hidden="true"
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-xl bg-surface px-3 py-2 text-caption shadow-card ring-1 ring-line"
          // Slides from left-aligned at the left edge to right-aligned at the right edge,
          // so the tip never hangs off the chart.
          style={{ left: `${column.at * 100}%`, transform: `translateX(-${column.at * 100}%)` }}
        >
          <p className="font-semibold whitespace-nowrap">{column.title}</p>
          <dl className="mt-1 space-y-0.5">
            {column.lines.map((l) => (
              <div key={l.label} className="flex items-center gap-2 whitespace-nowrap">
                {l.color && (
                  <span className="size-2 shrink-0 rounded-full" style={{ background: l.color }} />
                )}
                <dt className="flex-1 text-muted">{l.label}</dt>
                <dd className="font-medium tabular-nums">{l.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
