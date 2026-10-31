// Spending by envelope (or category) as a donut, and planned vs actual as bars. Lazy-loaded
// (PLAN §5): secondary views on Plan and Look back. The pictures are decorative for
// assistive tech; every number is also in the legend, the bar labels and a table
// (visually hidden until asked for), per PLAN §8. No red: going past a plan is plain text.
import { useId, useState } from 'react'
import { topCategories } from '../../domain/insights'
import { cx } from '../../ui/cx'
import type { Formatters } from '../bills/format'
import type { InsightRow } from './insightRows'
import { InsightsTable } from './InsightsTable'

interface Props {
  rows: InsightRow[]
  f: Formatters
  /** Names the figure for screen readers, e.g. "Spending by envelope, this period". */
  caption: string
  /** The word in the donut's middle: "Spent" for envelopes; "Out" when the groups include
   *  savings and debt, which are not spending. */
  centerLabel?: string
}

const REST = 'rest'
const SIZE = 132
const R = 52
const STROKE = 18
const C = 2 * Math.PI * R

export default function InsightsCharts({ rows, f, caption, centerLabel = 'Spent' }: Props) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()
  const { top, rest, total } = topCategories(rows)
  // Each row brings its own colour (an envelope's, as in the envelope list), so a slice,
  // its legend line and its bar always match. Rows rolled into "Everything else" are muted.
  const color = new Map(rows.map((r) => [r.key, r.color]))
  const colorOf = (key: string) => color.get(key) ?? 'var(--muted)'
  const slices = [
    ...top.map((s) => ({ key: s.row.key, name: s.row.name, amount: s.row.actual, share: s.share })),
    ...(rest > 0
      ? [{ key: REST, name: 'Everything else', amount: rest, share: rest / total }]
      : []),
  ]
  const bars = rows.filter((r) => r.actual > 0 || (r.planned ?? 0) > 0)
  const scale = Math.max(1, ...bars.map((r) => Math.max(r.actual, r.planned ?? 0)))
  const pct = (share: number) => f.percent(Math.round(share * 1000) / 1000)

  return (
    <figure>
      <figcaption className="sr-only">{caption}</figcaption>
      {!showTable && (
        <div aria-hidden="true" className="mb-3 space-y-7">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-7">
            <Donut slices={slices} colorOf={colorOf} label={centerLabel} total={f.money(total)} />
            <ul className="w-full min-w-0 flex-1 space-y-2 text-body">
              {slices.map((s) => (
                <li key={s.key} className="flex items-center gap-2.5 whitespace-nowrap">
                  <Swatch color={colorOf(s.key)} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 tabular-nums">{f.money(s.amount)}</span>
                  <span className="w-12 shrink-0 text-right text-sm text-muted tabular-nums">
                    {pct(s.share)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {bars.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium">Planned and actual</h3>
              <ul className="space-y-3.5">
                {bars.map((r) => (
                  <Bar key={r.key} row={r} scale={scale} color={colorOf(r.key)} f={f} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div id={tableId} className={cx(showTable ? 'mb-2' : 'sr-only')}>
        <InsightsTable rows={rows} total={total} f={f} caption={caption} />
      </div>
      <div className="flex justify-end print-hide">
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((s) => !s)}
          className="-mx-2 min-h-11 rounded-full px-2 text-sm font-medium text-accent"
        >
          {showTable ? 'Show as a chart' : 'Show as a table'}
        </button>
      </div>
    </figure>
  )
}

function Donut({
  slices,
  colorOf,
  label,
  total,
}: {
  slices: { key: string; share: number }[]
  colorOf: (key: string) => string
  label: string
  total: string
}) {
  // A hairline of surface between slices separates neighbours without relying on colour.
  const gap = slices.length > 1 ? 2 : 0
  // Each slice starts where the ones before it end.
  const starts = slices.map((_, i) => slices.slice(0, i).reduce((a, x) => a + x.share * C, 0))
  return (
    <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} className="block">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--line)"
          strokeWidth={STROKE}
        />
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {slices.map((s, i) => {
            const len = Math.max(0, s.share * C - gap)
            return (
              <circle
                key={s.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={colorOf(s.key)}
                strokeWidth={STROKE}
                strokeDasharray={`${len.toFixed(2)} ${(C - len).toFixed(2)}`}
                strokeDashoffset={(-starts[i]!).toFixed(2)}
              />
            )
          })}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-caption text-muted">{label}</span>
        <span className="max-w-[5.5rem] truncate text-sm font-semibold tabular-nums">{total}</span>
      </div>
    </div>
  )
}

function Bar({
  row,
  scale,
  color,
  f,
}: {
  row: InsightRow
  scale: number
  color: string
  f: Formatters
}) {
  const w = (v: number) => `${Math.min(100, (v / scale) * 100)}%`
  // A budget of 0 is "no budget yet", not a plan that was blown: no track to fill, just
  // the actual, so a full-looking bar never suggests a limit that was never set.
  const noBudget = row.planned === 0
  const planned = noBudget ? null : row.planned
  const over = planned !== null && planned > 0 && row.actual > planned
  return (
    <li>
      <div className="flex items-center gap-2.5 whitespace-nowrap text-body">
        <Swatch color={color} />
        <span className="min-w-0 flex-1 truncate">{row.name}</span>
        <span className="shrink-0 tabular-nums">
          {f.money(row.actual)}
          {planned !== null && <span className="text-muted"> of {f.money(planned)}</span>}
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-bg ring-1 ring-line">
        {planned !== null && (
          // The plan as a soft track of the same colour; the actual sits on top of it.
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: w(planned),
              background: `color-mix(in oklab, ${color} 22%, var(--surface))`,
            }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: w(row.actual), background: color }}
        />
        {over && (
          <div
            className="absolute inset-y-0 w-0.5 bg-text/60"
            style={{ left: `calc(${w(planned!)} - 1px)` }}
          />
        )}
      </div>
      {/* Under the bar, so a long envelope name keeps its room on a phone. */}
      {noBudget && (
        <p className="mt-1 text-caption text-muted tabular-nums">
          {f.money(row.actual)} spent · no budget yet
        </p>
      )}
      {over && (
        <p className="mt-1 text-caption text-muted tabular-nums">
          {f.money(row.actual - planned!)} past the plan. It came from what was free.
        </p>
      )}
    </li>
  )
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  )
}
