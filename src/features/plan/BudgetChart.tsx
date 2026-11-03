import type { EnvelopeUsage } from '../../domain/safeToSpend'
import { cx } from '../../ui/cx'
import { envelopeColor } from '../../ui/EnvelopeDot'
import type { Formatters } from '../bills/format'

/**
 * Budget vs actual (planned vs spent), one pair of bars per envelope. The planned bar is
 * an outline, the actual bar is filled in the envelope's colour, and anything still coming
 * this period sits on top of it, lighter. Over budget is said in words, never in red.
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
  /** Fewer columns and shorter bars, for Today. */
  compact?: boolean
  label: string
}) {
  const shown = rows.filter((r) => r.budget > 0 || r.spent + r.linkedDue > 0)
  if (shown.length === 0) return null
  if (compact) return <BudgetBars rows={shown} f={f} label={label} />
  const max = Math.max(1, ...shown.map((r) => Math.max(r.budget, r.spent + r.linkedDue)))
  const height = compact ? 96 : 160
  const px = (c: number) => (c <= 0 ? 0 : Math.max(3, Math.round((c / max) * height)))

  return (
    <figure className="m-0">
      <ul
        aria-label={label}
        className={cx(
          'grid gap-x-2 gap-y-6',
          compact
            ? 'grid-cols-3 sm:grid-cols-4'
            : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8',
        )}
      >
        {shown.map((r) => {
          const color = envelopeColor(r.color)
          const used = r.spent + r.linkedDue
          return (
            <li key={r.id} className="flex min-w-0 flex-col items-center text-center">
              <span className="sr-only">
                {r.name}: planned {f.money(r.budget)}, actual {f.money(r.spent)}
                {r.linkedDue > 0 ? `, ${f.money(r.linkedDue)} still coming` : ''}
                {r.over > 0 ? `, over by ${f.money(r.over)}` : ''}.
              </span>
              <div aria-hidden="true" className="flex items-end gap-1.5" style={{ height }}>
                <div
                  className="w-4 rounded-t-md border-2 sm:w-5"
                  style={{
                    height: px(r.budget),
                    borderColor: color,
                    backgroundColor: `color-mix(in oklab, ${color} 14%, var(--surface))`,
                  }}
                />
                <div className="flex w-4 flex-col justify-end sm:w-5">
                  {r.linkedDue > 0 && (
                    <div
                      className="rounded-t-md"
                      style={{
                        height: px(used) - px(r.spent),
                        backgroundColor: `color-mix(in oklab, ${color} 40%, var(--surface))`,
                      }}
                    />
                  )}
                  <div
                    className={cx(r.linkedDue > 0 ? '' : 'rounded-t-md')}
                    style={{ height: px(r.spent), backgroundColor: color }}
                  />
                </div>
              </div>
              <span
                aria-hidden="true"
                className="mt-2 line-clamp-2 text-caption leading-tight font-semibold"
              >
                {r.name}
              </span>
              <span aria-hidden="true" className="text-[0.75rem] text-muted tabular-nums">
                {f.money(r.budget)} / {f.money(r.spent)}
              </span>
              {r.linkedDue > 0 && (
                <span aria-hidden="true" className="text-[0.75rem] text-muted">
                  +{f.money(r.linkedDue)} coming
                </span>
              )}
              {r.over > 0 && (
                <span aria-hidden="true" className="text-[0.75rem] text-muted">
                  {f.money(r.over)} over plan
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <figcaption className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-caption text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm border-2 border-muted" />
          Planned
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-muted" />
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm bg-muted/40" />
          Still coming
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
