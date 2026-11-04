import type { EnvelopeUsage } from '../../domain/safeToSpend'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { Formatters } from '../bills/format'

/** What a column's two numbers leave out: still coming, and how far past plan it goes. */
function extras(r: EnvelopeUsage, f: Formatters): string[] {
  return [
    r.linkedDue > 0 ? `${f.money(r.linkedDue)} still coming` : '',
    r.over > 0 ? `${f.money(r.over)} over plan` : '',
  ].filter(Boolean)
}

/**
 * Budget vs actuals on Home: a pair of bars per envelope (planned as a light outline,
 * actual filled in the envelope's colour) on one shared scale. Under each pair, only its
 * name and "planned / actual"; what is still coming and how far past plan it goes are in
 * the tooltip and the screen-reader sentence. Over budget is said in words, never in red.
 *
 * Inside an `@container` (Home): three columns to a row on a phone, fixed-width columns
 * that wrap and centre once there is room. Every column's label area is the same height,
 * so the bars in a row stand on one baseline.
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
  const shown = rows.filter((r) => r.budget > 0 || r.spent + r.linkedDue > 0)
  if (shown.length === 0) return null
  const max = Math.max(1, ...shown.map((r) => Math.max(r.budget, r.spent)))
  // A share of the plot's height, so the plot can be shorter on a phone. Zero still shows
  // a small stub (min-h), so a column never looks like it is missing a bar.
  const pct = (c: number) => `${Math.max(0, (c / max) * 100)}%`

  return (
    <div>
      <ul
        aria-labelledby={labelledBy}
        className="flex flex-wrap items-start justify-center gap-x-1 gap-y-6 @xl:gap-x-2 @xl:gap-y-8"
      >
        {shown.map((r) => {
          const color = envelopeColor(r.color)
          const more = extras(r, f)
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
              <div aria-hidden="true" className="flex h-36 items-end gap-1.5 @xl:h-52">
                <div
                  className="min-h-1.5 w-5 rounded-t-lg border-[1.5px] border-b-0 @xl:w-6"
                  style={{
                    height: pct(r.budget),
                    borderColor: color,
                    backgroundColor: `color-mix(in oklab, ${color} 12%, var(--surface))`,
                  }}
                />
                <div
                  className="min-h-1.5 w-5 rounded-t-lg @xl:w-6"
                  style={{ height: pct(r.spent), backgroundColor: color }}
                />
              </div>
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
          <span className="h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-muted" />
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
