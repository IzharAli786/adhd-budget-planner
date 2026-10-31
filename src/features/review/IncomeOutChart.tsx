// Money in vs money out per month (or pay period) as paired bars. Lazy-loaded (PLAN §5).
// The picture is an image with a short label; the screen's table right below holds every
// number, so nothing here is only in the chart. Out is drawn in the neutral muted tone,
// never red: spending is not a mistake.
import { useSyncExternalStore } from 'react'
import type { Cents } from '../../domain/money'

export interface IncomeOutPoint {
  key: string
  /** Short axis label: "Jan", "30 Oct". */
  label: string
  incomeIn: Cents
  moneyOut: Cents
}

const H = 168
// A wider drawing on wide screens: the same height, so the chart doesn't grow into a wall
// and its labels stay at text size instead of scaling up with the card.
const WIDE = '(min-width: 48rem)'
const wideQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null)
function subscribe(cb: () => void) {
  const mq = wideQuery()
  mq?.addEventListener('change', cb)
  return () => mq?.removeEventListener('change', cb)
}
const useWide = () =>
  useSyncExternalStore(
    subscribe,
    () => wideQuery()?.matches ?? false,
    () => false,
  )
const PAD = { top: 8, right: 4, bottom: 20, left: 4 }

export default function IncomeOutChart({
  points,
  label,
}: {
  points: IncomeOutPoint[]
  /** What the image shows, for screen readers. */
  label: string
}) {
  const W = useWide() ? 680 : 340
  const n = Math.max(points.length, 1)
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const max = Math.max(1, ...points.flatMap((p) => [p.incomeIn, p.moneyOut]))
  const gw = plotW / n
  const bw = Math.min(11, gw * 0.34)
  const y = (v: Cents) => PAD.top + plotH - (Math.max(0, v) / max) * plotH
  // Every label when they fit (12 months), else every few (26 fortnights).
  const every = Math.max(1, Math.ceil(n / 12))

  return (
    <figure className="space-y-3">
      <div className="animate-fade-in rounded-2xl bg-bg px-2 pt-3 pb-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full"
          role="img"
          aria-label={label}
        >
          {[0.25, 0.5, 0.75].map((t) => (
            <line
              key={t}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={PAD.top + t * plotH}
              y2={PAD.top + t * plotH}
              stroke="var(--line)"
              strokeWidth={1}
            />
          ))}
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH}
            y2={PAD.top + plotH}
            stroke="var(--muted)"
            strokeOpacity={0.4}
          />
          {points.map((p, i) => {
            const cx = PAD.left + gw * i + gw / 2
            return (
              <g key={p.key}>
                <Bar
                  x={cx - bw - 1}
                  top={y(p.incomeIn)}
                  bottom={PAD.top + plotH}
                  w={bw}
                  fill="var(--accent)"
                />
                <Bar
                  x={cx + 1}
                  top={y(p.moneyOut)}
                  bottom={PAD.top + plotH}
                  w={bw}
                  fill="var(--muted)"
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
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-accent" />
          Money in
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-sm bg-muted" />
          Money out
        </span>
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
