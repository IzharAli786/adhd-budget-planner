import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { EnvelopeUsage } from '../../domain/safeToSpend'
import { tint } from '../../ui/dataColors'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { Formatters } from '../bills/format'

/** What a column's two numbers leave out: still coming, and how far past plan it goes. */
function extras(r: EnvelopeUsage, f: Formatters): string[] {
  return [
    r.linkedDue > 0 ? `${f.money(r.linkedDue)} still coming` : '',
    r.over > 0 ? `${f.money(r.over)} over plan` : '',
  ].filter(Boolean)
}

const tallest = (r: EnvelopeUsage) => Math.max(r.budget, r.spent)

/**
 * Which visual row each column sits on, read from the layout (columns wrap by width).
 * Null until measured, and wherever layout can't be read: then everything is one row.
 */
function useRowIndex(list: RefObject<HTMLUListElement | null>, count: number) {
  const [rows, setRows] = useState<number[] | null>(null)
  useLayoutEffect(() => {
    const ul = list.current
    if (!ul) return
    const measure = () => {
      const tops = [...ul.children].map((li) => (li as HTMLElement).offsetTop)
      const lines = [...new Set(tops)].sort((a, b) => a - b)
      const next = tops.map((t) => lines.indexOf(t))
      setRows((prev) =>
        prev && prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next,
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(ul)
    return () => observer.disconnect()
  }, [list, count])
  return rows
}

/**
 * Budget vs actuals on Home: a pair of bars per envelope (planned as an outline in the
 * envelope's colour, actual filled in it) on one shared scale. Under each pair, only its
 * name and "planned / actual"; what is still coming and how far past plan it goes are in
 * the tooltip and the screen-reader sentence. Over budget is said in words, never in red.
 *
 * Inside an `@container` (Home): three columns to a row on a phone, fixed-width columns
 * that wrap and centre once there is room. Each row's plot is as tall as its tallest bar
 * (between h-16 and the full h-36 / h-52), so a row of small envelopes doesn't float over
 * empty space, and its bars stand on one baseline. Every column's label area is the same
 * height, so the bars in a row line up whatever the names need.
 */
export function BudgetChart({
  rows,
  f,
  labelledBy,
}: {
  rows: readonly EnvelopeUsage[]
  f: Formatters
  /** The id of the section heading that names the list. */
  labelledBy: string
}) {
  const list = useRef<HTMLUListElement>(null)
  const shown = rows.filter((r) => r.budget > 0 || r.spent + r.linkedDue > 0)
  const rowOf = useRowIndex(list, shown.length)
  if (shown.length === 0) return null
  const max = Math.max(1, ...shown.map(tallest))
  // The tallest bar on each visual row, as a share of the shared scale.
  const rowMax = new Map<number, number>()
  shown.forEach((r, i) => {
    const row = rowOf?.[i] ?? 0
    rowMax.set(row, Math.max(rowMax.get(row) ?? 0, tallest(r)))
  })
  // A share of the full plot height (--plot-h, shorter on a phone). Zero still shows a
  // small stub (min-h), so a column never looks like it is missing a bar.
  const height = (c: number) => `calc(var(--plot-h) * ${Math.max(0, c / max)})`

  return (
    <div>
      <ul
        ref={list}
        aria-labelledby={labelledBy}
        className="flex flex-wrap items-start justify-center gap-x-1 gap-y-6 [--plot-h:9rem] @xl:gap-x-2 @xl:gap-y-8 @xl:[--plot-h:13rem]"
      >
        {shown.map((r, i) => {
          const color = envelopeColor(r.color)
          const more = extras(r, f)
          const plot = rowMax.get(rowOf?.[i] ?? 0) ?? max
          return (
            <li
              key={r.id}
              title={more.length > 0 ? `${r.name}: ${more.join(', ')}` : undefined}
              className="flex w-[calc((100%-0.5rem)/3)] min-w-0 flex-col items-center text-center @xl:w-[7.5rem]"
            >
              <span className="sr-only">
                {r.name}: planned {f.money(r.budget)}, actual {f.money(r.spent)}
                {r.linkedDue > 0 ? `, ${f.money(r.linkedDue)} still coming` : ''}
                {r.over > 0 ? `, over by ${f.money(r.over)}` : ''}.
              </span>
              <div
                aria-hidden="true"
                className="flex min-h-16 items-end gap-1.5"
                style={{ height: height(plot) }}
              >
                <div
                  className="min-h-1.5 w-5 rounded-t-lg border-[1.5px] border-b-0 @xl:w-6"
                  style={{
                    height: height(r.budget),
                    borderColor: color,
                    backgroundColor: tint(color, 12),
                  }}
                />
                <div
                  className="min-h-1.5 w-5 rounded-t-lg @xl:w-6"
                  style={{ height: height(r.spent), backgroundColor: color }}
                />
              </div>
              {/* The baseline: it runs into the gaps, so a row reads as one line. */}
              <div aria-hidden="true" className="-mx-0.5 h-px self-stretch bg-line @xl:-mx-1" />
              {/* Room for the longest label (two lines of name, two of numbers on a phone), so
                  every column's bars stand on the same line whatever its own label needs. */}
              <div
                aria-hidden="true"
                className="mt-2.5 flex min-h-[4.875rem] w-full flex-col @xl:min-h-[3.75rem]"
              >
                <span className="line-clamp-2 text-body leading-tight font-semibold [overflow-wrap:anywhere] hyphens-auto">
                  {r.name}
                </span>
                <span className="mt-1 text-caption text-muted tabular-nums">
                  {f.money(r.budget)} / {f.money(r.spent)}
                </span>
              </div>
            </li>
          )
        })}
      </ul>
      <div
        aria-hidden="true"
        className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-1 text-body text-muted"
      >
        <span className="inline-flex items-center gap-2">
          <span
            className="h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-muted"
            style={{ backgroundColor: tint('var(--muted)', 12) }}
          />
          Planned
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded-[3px] bg-muted" />
          Actual
        </span>
      </div>
    </div>
  )
}
