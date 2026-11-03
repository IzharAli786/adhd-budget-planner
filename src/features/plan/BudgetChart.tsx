import type { EnvelopeUsage } from '../../domain/safeToSpend'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { Formatters } from '../bills/format'

/**
 * Budget vs actuals (planned vs spent), one pair of bars per envelope, on one shared
 * scale. The planned bar is a light outline, the actual bar is filled in the envelope's
 * colour; columns wrap to new rows and centre. Over budget is said in words, never in red.
 *
 * The bars are decorative: every number is also written under them, and each column has a
 * full sentence for screen readers.
 */
export function BudgetChart({
  rows,
  f,
  compact = false,
  label,
}: {
  rows: readonly EnvelopeUsage[]
  f: Formatters
  /** One row per envelope instead of columns, for Today. */
  compact?: boolean
  label: string
}) {
  const shown = rows.filter((r) => r.budget > 0 || r.spent + r.linkedDue > 0)
  if (shown.length === 0) return null
  if (compact) return <BudgetBars rows={shown} f={f} label={label} />
  const max = Math.max(1, ...shown.map((r) => Math.max(r.budget, r.spent)))
  // A share of the plot's height, so the plot can be shorter on a phone. Zero still shows
  // a small stub, so a column never looks like it is missing a bar.
  const pct = (c: number) => `${Math.max(0, (c / max) * 100)}%`

  return (
    <figure className="m-0">
      <ul
        aria-label={label}
        className="flex flex-wrap items-end justify-center gap-x-1 gap-y-10 sm:gap-x-2"
      >
        {shown.map((r) => {
          const color = envelopeColor(r.color)
          return (
            <li
              key={r.id}
              className="flex w-[6.25rem] min-w-0 flex-col items-center text-center sm:w-[8.5rem]"
            >
              <span className="sr-only">
                {r.name}: planned {f.money(r.budget)}, actual {f.money(r.spent)}
                {r.linkedDue > 0 ? `, ${f.money(r.linkedDue)} still coming` : ''}
                {r.over > 0 ? `, over by ${f.money(r.over)}` : ''}.
              </span>
              <div aria-hidden="true" className="flex h-36 items-end gap-1.5 sm:h-52">
                <div
                  className="min-h-1.5 w-5 rounded-t-lg border-[1.5px] border-b-0 sm:w-6"
                  style={{
                    height: pct(r.budget),
                    borderColor: color,
                    backgroundColor: `color-mix(in oklab, ${color} 12%, var(--surface))`,
                  }}
                />
                <div
                  className="min-h-1.5 w-5 rounded-t-lg sm:w-6"
                  style={{ height: pct(r.spent), backgroundColor: color }}
                />
              </div>
              <span
                aria-hidden="true"
                className="mt-2.5 line-clamp-2 text-body leading-tight font-semibold"
              >
                {r.name}
              </span>
              <span aria-hidden="true" className="mt-1 text-caption text-muted tabular-nums">
                {f.money(r.budget)} / {f.money(r.spent)}
              </span>
              {r.linkedDue > 0 && (
                <span aria-hidden="true" className="text-caption text-muted tabular-nums">
                  +{f.money(r.linkedDue)} coming
                </span>
              )}
              {r.over > 0 && (
                <span aria-hidden="true" className="text-caption text-muted tabular-nums">
                  {f.money(r.over)} over plan
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <figcaption className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-1 text-body text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-[3px] border-[1.5px] border-muted"
          />
          Planned
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-[3px] bg-muted" />
          Actual
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * Today's version: one row per envelope, each bar scaled to its own budget, so a small
 * Coffee envelope reads as clearly as Rent. Planned is the track, actual the fill.
 */
function BudgetBars({
  rows,
  f,
  label,
}: {
  rows: readonly EnvelopeUsage[]
  f: Formatters
  label: string
}) {
  return (
    <ul aria-label={label} className="space-y-3.5">
      {rows.map((r) => {
        const color = envelopeColor(r.color)
        const used = r.spent + r.linkedDue
        const scale = Math.max(r.budget, used, 1)
        return (
          <li key={r.id}>
            <div className="flex items-baseline justify-between gap-3 text-body">
              <span className="min-w-0 truncate font-medium">{r.name}</span>
              <span className="shrink-0 text-sm text-muted tabular-nums">
                <span className="font-semibold text-text">{f.money(r.spent)}</span>
                {r.budget > 0 ? ` of ${f.money(r.budget)}` : ' · no budget'}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 flex h-2.5 overflow-hidden rounded-full"
              style={{ backgroundColor: `color-mix(in oklab, ${color} 16%, var(--surface))` }}
            >
              <div style={{ width: `${(r.spent / scale) * 100}%`, backgroundColor: color }} />
              <div
                style={{
                  width: `${(r.linkedDue / scale) * 100}%`,
                  backgroundColor: `color-mix(in oklab, ${color} 45%, var(--surface))`,
                }}
              />
            </div>
            <p className="sr-only">
              {r.name}: planned {f.money(r.budget)}, actual {f.money(r.spent)}
              {r.linkedDue > 0 ? `, ${f.money(r.linkedDue)} still coming` : ''}.
            </p>
            {(r.linkedDue > 0 || r.over > 0) && (
              <p className="mt-1 text-caption text-muted tabular-nums">
                {r.linkedDue > 0 && `${f.money(r.linkedDue)} still coming`}
                {r.linkedDue > 0 && r.over > 0 && ' · '}
                {r.over > 0 && `${f.money(r.over)} over plan`}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
