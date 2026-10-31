import type { ReactNode } from 'react'
import { cx } from './cx'

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0))

/**
 * A calm bar. Always the accent colour, even when full or past it: going over is said in
 * words next to it ("over by €4"), never by turning the bar red (PLAN §1.3).
 */
export function ProgressBar({
  value,
  label,
  className,
}: {
  /** 0..1; values outside are clamped. */
  value: number
  /** Accessible name, e.g. "Food used". */
  label: string
  className?: string
}) {
  const v = clamp01(value)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cx('h-2 overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
        style={{ width: `${v * 100}%` }}
      />
    </div>
  )
}

/** A ring for savings goals; the centre takes whatever the caller puts there. */
export function ProgressRing({
  value,
  label,
  size = 64,
  children,
}: {
  value: number
  label: string
  size?: number
  children?: ReactNode
}) {
  const v = clamp01(value)
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--line)"
          strokeWidth={stroke}
        />
        {/* Round caps would draw a dot at 0%, so an empty ring has no arc at all. */}
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - v)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        )}
      </svg>
      {children && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums">
          {children}
        </span>
      )}
    </div>
  )
}
