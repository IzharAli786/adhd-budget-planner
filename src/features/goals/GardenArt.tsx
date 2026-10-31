import type { ReactNode } from 'react'

// A hand-drawn plant in six stages (domain/garden.ts GARDEN_STAGES). Each stage only ADDS
// to the one before (taller stem, more leaves, buds, flowers), so growth reads as growth.
// The sway lives in app.css; reduced motion turns it off and leaves a still picture.

const X = 120
const GROUND = 148
const STEM = [0, 24, 46, 66, 80, 88]

/** A leaf with its base at (x, y), pointing along `angle` degrees. */
function Leaf({ x, y, angle, size }: { x: number; y: number; angle: number; size: number }) {
  const s = size
  return (
    <path
      d={`M0 0C${s * 0.3} ${-s * 0.42} ${s * 0.78} ${-s * 0.42} ${s} 0C${s * 0.78} ${s * 0.42} ${s * 0.3} ${s * 0.42} 0 0Z`}
      transform={`translate(${x} ${y}) rotate(${angle})`}
      fill="var(--leaf)"
    />
  )
}

function Flower({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse
          key={a}
          cx={x}
          cy={y - r * 0.85}
          rx={r * 0.52}
          ry={r * 0.85}
          transform={`rotate(${a} ${x} ${y})`}
          fill="var(--accent)"
          opacity={0.88}
        />
      ))}
      <circle cx={x} cy={y} r={r * 0.42} fill="var(--surface)" />
      <circle cx={x} cy={y} r={r * 0.22} fill="var(--soil-deep)" />
    </g>
  )
}

function Bud({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <ellipse cx={x} cy={y - r * 0.5} rx={r * 0.7} ry={r} fill="var(--accent)" opacity={0.85} />
      <path
        d={`M${x - r * 0.75} ${y - r * 0.1}Q${x} ${y + r * 0.7} ${x + r * 0.75} ${y - r * 0.1}`}
        fill="var(--leaf-deep)"
      />
    </g>
  )
}

export function GardenArt({ stage, size = 240 }: { stage: number; size?: number }) {
  const h = STEM[Math.max(0, Math.min(5, stage))]!
  const top = GROUND - h
  const at = (t: number) => GROUND - h * t
  const parts: ReactNode[] = []

  if (stage >= 1) {
    parts.push(
      <path
        key="stem"
        d={`M${X} ${GROUND}C${X - 3} ${at(0.4)} ${X + 4} ${at(0.7)} ${X} ${top}`}
        stroke="var(--leaf-deep)"
        strokeWidth={stage >= 3 ? 3.2 : 2.4}
        strokeLinecap="round"
        fill="none"
      />,
    )
    const pairs: [number, number][] =
      stage === 1
        ? [[1, 11]]
        : stage === 2
          ? [
              [0.45, 15],
              [1, 12],
            ]
          : [
              [0.3, 20],
              [0.6, 18],
              [0.88, 14],
            ]
    for (const [t, s] of pairs) {
      parts.push(
        <Leaf key={`l${t}`} x={X} y={at(t)} angle={-28} size={s} />,
        <Leaf key={`r${t}`} x={X} y={at(t)} angle={-152} size={s} />,
      )
    }
  }
  if (stage >= 3) {
    // A side branch that later carries its own flower.
    parts.push(
      <path
        key="branch"
        d={`M${X} ${at(0.5)}Q${X + 18} ${at(0.62)} ${X + 26} ${at(0.78)}`}
        stroke="var(--leaf-deep)"
        strokeWidth={2.2}
        strokeLinecap="round"
        fill="none"
      />,
      <Leaf key="bl" x={X + 20} y={at(0.66)} angle={-70} size={11} />,
    )
  }
  if (stage === 4) {
    parts.push(<Bud key="b1" x={X} y={top} r={7} />, <Bud key="b2" x={X + 26} y={at(0.78)} r={5} />)
  }
  if (stage >= 5) {
    parts.push(
      <Flower key="f1" x={X} y={top - 4} r={11} />,
      <Flower key="f2" x={X + 27} y={at(0.8) - 2} r={7} />,
    )
  }

  return (
    <svg
      viewBox="0 0 240 180"
      width={size}
      height={(size * 180) / 240}
      aria-hidden="true"
      className="garden mx-auto block max-w-full"
    >
      <circle cx={X} cy={98} r={74} fill="var(--accent-soft)" />
      {stage >= 5 && (
        // A little companion appears once the main plant blooms.
        <g className="garden-grow">
          <path
            d={`M70 ${GROUND + 2}Q69 ${GROUND - 14} 72 ${GROUND - 24}`}
            stroke="var(--leaf-deep)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
          <Leaf x={71} y={GROUND - 10} angle={-150} size={10} />
          <Bud x={72} y={GROUND - 24} r={4.5} />
        </g>
      )}
      <g className="garden-sway" style={{ transformOrigin: `${X}px ${GROUND}px` }}>
        <g key={stage} className="garden-grow">
          {parts}
        </g>
      </g>
      <path
        d={`M14 ${GROUND + 6}Q120 ${GROUND - 14} 226 ${GROUND + 6}L226 180L14 180Z`}
        fill="var(--soil)"
      />
      {stage === 0 && (
        <g>
          <ellipse cx={X} cy={GROUND - 1} rx={7} ry={4.5} fill="var(--soil-deep)" />
          <path
            d={`M${X} ${GROUND - 5}q2 -6 6 -7`}
            stroke="var(--leaf)"
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      )}
    </svg>
  )
}
