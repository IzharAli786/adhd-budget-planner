// Money in vs money out per month (or pay period) as paired bars. Lazy-loaded (PLAN §5).
// The picture is an image with a short label; tapping, hovering or focusing a column reads
// its numbers (ChartTips), and the screen's table right below holds every number too.
// Out is drawn in the neutral muted tone, never red: spending is not a mistake.
import { niceMax } from '../../domain/chartScale'
import type { Cents } from '../../domain/money'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { ChartTips } from '../../ui/ChartTips'
import { DATA_COLOR } from '../../ui/dataColors'
import type { Formatters } from '../bills/format'

export interface IncomeOutPoint {
  key: string
  /** Short axis label: "Jan", "30 Oct". */
  label: string
  /** Full name in the tip and for screen readers: "January 2026". */
  title: string
  incomeIn: Cents
  moneyOut: Cents
}

const H = 168
// A wider drawing on wide screens: the same height, so the chart doesn't grow into a wall
// and its labels stay at text size instead of scaling up with the card.
const useWide = () => useMediaQuery('(min-width: 48rem)')
// Room on the left for the light axis labels ("€2K").
const PAD = { top: 10, right: 4, bottom: 20, left: 34 }

export default function IncomeOutChart({
  points,
  label,
  columnsLabel,
  unit,
  f,
}: {
  points: IncomeOutPoint[]
  /** What the image shows, for screen readers. */
  label: string
  /** Names the tap targets: "Money in and out, month by month". */
  columnsLabel: string
  /** "month" or "pay period", for the hint under the chart. */
  unit: string
  f: Formatters
}) {
  const W = useWide() ? 680 : 340
  const n = Math.max(points.length, 1)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  // A round top ("€3K", not "€2,871") so the gridline labels read at a glance.
  const max = niceMax(Math.max(0, ...points.flatMap((p) => [p.incomeIn, p.moneyOut])))
  const gw = plotW / n
  const bw = Math.min(11, gw * 0.34)
  const y = (v: Cents) => PAD.top + plotH - (Math.max(0, v) / max) * plotH
  // Every label when they fit (12 months), else every few (26 fortnights).
  const every = Math.max(1, Math.ceil(n / 12))
  const columns = points.map((p, i) => ({
    key: p.key,
    title: p.title,
    at: (PAD.left + gw * i + gw / 2) / W,
    lines: [
      { label: 'In', value: f.money(p.incomeIn), color: DATA_COLOR.in },
      { label: 'Out', value: f.money(p.moneyOut), color: DATA_COLOR.out },
    ],
  }))

  return (
    <figure className="space-y-3">
      <div className="animate-fade-in rounded-2xl bg-bg px-2 pt-3 pb-1">
        <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            role="img"
            aria-label={label}
          >
            {[0, 0.5, 1].map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={PAD.top + (1 - t) * plotH}
                  y2={PAD.top + (1 - t) * plotH}
                  stroke={t === 0 ? 'var(--muted)' : 'var(--line)'}
                  strokeOpacity={t === 0 ? 0.4 : 1}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 5}
                  y={PAD.top + (1 - t) * plotH + 3}
                  fontSize={9}
                  fill="var(--muted)"
                  textAnchor="end"
                >
                  {f.moneyShort(max * t)}
                </text>
              </g>
            ))}
            {points.map((p, i) => {
              const cx = PAD.left + gw * i + gw / 2
              return (
                <g key={p.key}>
                  <Bar
                    x={cx - bw - 1}
                    top={y(p.incomeIn)}
                    bottom={PAD.top + plotH}
                    w={bw}
                    fill={DATA_COLOR.in}
                  />
                  <Bar
                    x={cx + 1}
                    top={y(p.moneyOut)}
                    bottom={PAD.top + plotH}
                    w={bw}
                    fill={DATA_COLOR.out}
                  />
                  {i % every === 0 && (
                    <text x={cx} y={H - 5} fontSize={9.5} fill="var(--muted)" textAnchor="middle">
                      {p.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
          <ChartTips columns={columns} label={columnsLabel} />
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: DATA_COLOR.in }}
          />
          Money in
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-sm"
            style={{ backgroundColor: DATA_COLOR.out }}
          />
          Money out
        </span>
        <span>Tap a {unit} to read it</span>
      </figcaption>
    </figure>
  )
}

function Bar({
  x,
  top,
  bottom,
  w,
  fill,
}: {
  x: number
  top: number
  bottom: number
  w: number
  fill: string
}) {
  const h = bottom - top
  if (h <= 0) return null
  // Rounded top only: a full rounded rect would lift the bar off the baseline.
  const r = Math.min(2.5, w / 2, h)
  return (
    <path
      d={`M${x},${bottom}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${bottom}Z`}
      fill={fill}
    />
  )
}
