// Balance over time for both strategies. Lazy-loaded (PLAN §5): it is the one heavy,
// secondary view on the Goals tab. The SVG is decorative for assistive tech; tapping,
// hovering or focusing a month reads both balances (ChartTips), and the same numbers are
// always in a table (visually hidden until asked for), per PLAN §8.
import { useCallback, useId, useState } from 'react'
import { niceMax } from '../../domain/chartScale'
import { addMonths } from '../../domain/dates'
import type { Cents } from '../../domain/money'
import type { ISODate } from '../../domain/types'
import { ChartTips } from '../../ui/ChartTips'
import { cx } from '../../ui/cx'
import type { Formatters } from '../bills/format'

interface PayoffChartProps {
  snowball: Cents[]
  avalanche: Cents[]
  today: ISODate
  f: Formatters
}

const W = 320
const H = 150
// Room on the left for the light axis labels ("€2.5K").
const PAD = { top: 10, right: 8, bottom: 22, left: 36 }
const plotH = H - PAD.top - PAD.bottom
const xAt = (m: number, months: number) =>
  PAD.left + (m / Math.max(1, months)) * (W - PAD.left - PAD.right)
const yAt = (v: Cents, max: number) => PAD.top + (1 - v / Math.max(1, max)) * plotH

function linePath(series: Cents[], months: number, max: number) {
  const x = (m: number) => xAt(m, months)
  const y = (v: Cents) => yAt(v, max)
  return series
    .map((v, m) => `${m === 0 ? 'M' : 'L'}${x(m).toFixed(1)},${y(v).toFixed(1)}`)
    .join('')
}

/** ~12 rows whatever the length: every month for a short plan, every few for a long one. */
function sampleMonths(months: number): number[] {
  const step = Math.max(1, Math.ceil(months / 12))
  const out: number[] = []
  for (let m = 0; m < months; m += step) out.push(m)
  out.push(months)
  return out
}

export default function PayoffChart({ snowball, avalanche, today, f }: PayoffChartProps) {
  const [showTable, setShowTable] = useState(false)
  const tableId = useId()
  const months = Math.max(snowball.length, avalanche.length) - 1
  // A round top so the gridline labels read at a glance.
  const max = niceMax(Math.max(snowball[0] ?? 0, avalanche[0] ?? 0, ...snowball, ...avalanche))
  const at = (series: Cents[], m: number) => series[Math.min(m, series.length - 1)] ?? 0
  const monthLabel = (m: number) => f.month(addMonths(today, m))
  const sampled = sampleMonths(months)
  const [active, setActive] = useState<number | null>(null)
  const onActive = useCallback((i: number | null) => setActive(i), [])
  const activeMonth = active === null ? null : (sampled[active] ?? null)
  const columns = sampled.map((m) => ({
    key: String(m),
    title: monthLabel(m),
    at: xAt(m, months) / W,
    lines: [
      { label: 'Avalanche', value: f.money(at(avalanche, m)), color: 'var(--accent)' },
      { label: 'Snowball', value: f.money(at(snowball, m)), color: 'var(--muted)' },
    ],
  }))

  return (
    <figure className="space-y-3">
      <div className="animate-fade-in rounded-2xl bg-bg px-2 pt-3 pb-1">
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
            {[0.5, 1].map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={yAt(max * t, max)}
                  y2={yAt(max * t, max)}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 5}
                  y={yAt(max * t, max) + 3}
                  fontSize={9}
                  fill="var(--muted)"
                  textAnchor="end"
                >
                  {f.moneyShort(max * t)}
                </text>
              </g>
            ))}
            <text
              x={PAD.left - 5}
              y={H - PAD.bottom + 3}
              fontSize={9}
              fill="var(--muted)"
              textAnchor="end"
            >
              {f.moneyShort(0)}
            </text>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={H - PAD.bottom}
              y2={H - PAD.bottom}
              stroke="var(--muted)"
              strokeOpacity={0.4}
            />
            {/* Dashed vs solid, not only colour, tells the two lines apart. */}
            <path
              d={linePath(snowball, months, max)}
              fill="none"
              stroke="var(--muted)"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={linePath(avalanche, months, max)}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {activeMonth !== null && (
              <g>
                <line
                  x1={xAt(activeMonth, months)}
                  x2={xAt(activeMonth, months)}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  stroke="var(--muted)"
                  strokeOpacity={0.5}
                />
                <circle
                  cx={xAt(activeMonth, months)}
                  cy={yAt(at(snowball, activeMonth), max)}
                  r={3.5}
                  fill="var(--surface)"
                  stroke="var(--muted)"
                  strokeWidth={2}
                />
                <circle
                  cx={xAt(activeMonth, months)}
                  cy={yAt(at(avalanche, activeMonth), max)}
                  r={3.5}
                  fill="var(--accent)"
                />
              </g>
            )}
            <text x={PAD.left} y={H - 6} fontSize={10} fill="var(--muted)">
              {f.month(today)}
            </text>
            <text x={W - PAD.right} y={H - 6} fontSize={10} fill="var(--muted)" textAnchor="end">
              {monthLabel(months)}
            </text>
          </svg>
          <ChartTips columns={columns} label="Total owed, month by month" onActive={onActive} />
        </div>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="6" aria-hidden="true">
            <line
              x1="1"
              x2="21"
              y1="3"
              y2="3"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          Avalanche
        </span>
        <span className="inline-flex items-center gap-2">
          <svg width="22" height="6" aria-hidden="true">
            <line
              x1="1"
              x2="21"
              y1="3"
              y2="3"
              stroke="var(--muted)"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          </svg>
          Snowball
        </span>
        {/* The start, not the peak: with interest outrunning a minimum, the peak comes later. */}
        <span>Total owed, starting at {f.money(snowball[0] ?? 0)}</span>
        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((s) => !s)}
          className="-mx-2 ml-auto min-h-11 rounded-full px-2 font-medium text-accent"
        >
          {showTable ? 'Hide table' : 'Show as a table'}
        </button>
      </figcaption>

      <div id={tableId} className={cx(!showTable && 'sr-only')}>
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Total owed by month, snowball and avalanche</caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-2 font-medium">
                Month
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Snowball
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Avalanche
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sampled.map((m) => (
              <tr key={m}>
                <th scope="row" className="py-2 text-left font-normal">
                  {monthLabel(m)}
                </th>
                <td className="py-2 text-right">{f.money(at(snowball, m))}</td>
                <td className="py-2 text-right">{f.money(at(avalanche, m))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
