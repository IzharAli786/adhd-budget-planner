import type { ReactNode } from 'react'

// Small spot illustrations for empty states. Same language as the icon set (round caps,
// one stroke weight, currentColor), drawn on a soft theme-tinted blob so every theme
// gets matching art for free. Decorative: the heading next to it carries the meaning.
const SCENES = {
  /** Bills and paydays: a calendar page with one day circled. */
  calendar: (
    <>
      <rect x="50" y="26" width="60" height="58" rx="10" className="fill-surface" />
      <path d="M50 44h60M64 20v12M96 20v12" />
      <path d="M62 56h.01M74 56h.01M86 56h.01M62 68h.01M74 68h.01M98 56h.01" strokeWidth="3.5" />
      <circle cx="98" cy="68" r="7" className="stroke-accent" />
    </>
  ),
  /** Savings: a sprout in a small pot. */
  sprout: (
    <>
      <path d="M80 66V44" />
      <path d="M80 52c0-10-8-16-18-16 0 10 8 16 18 16Z" className="fill-accent-soft" />
      <path d="M80 46c0-9 7-14 16-14 0 9-7 14-16 14Z" className="fill-accent-soft" />
      <path d="M62 66h36l-5 20H67l-5-20Z" className="fill-surface" />
      <path d="M60 66h40" />
    </>
  ),
  /** Transactions: an open notebook. */
  notebook: (
    <>
      <path
        d="M80 34c-8-5-18-6-28-4v50c10-2 20-1 28 4 8-5 18-6 28-4V30c-10-2-20-1-28 4Z"
        className="fill-surface"
      />
      <path d="M80 34v50" />
      <path d="M60 44h12M60 54h12M60 64h8M88 44h12M88 54h8" className="stroke-muted" />
    </>
  ),
  /** Recently deleted: an empty tray, nothing waiting. */
  tray: (
    <>
      <path
        d="M48 62l10-26h44l10 26v18a6 6 0 0 1-6 6H54a6 6 0 0 1-6-6V62Z"
        className="fill-surface"
      />
      <path d="M48 62h18l4 8h20l4-8h18" />
      <path d="M72 46h16" className="stroke-muted" />
    </>
  ),
  /** Debts: a path winding up to a flag. */
  path: (
    <>
      <path d="M46 88c14-2 22-8 22-16s14-10 22-12 12-8 12-16" strokeDasharray="1 7" />
      <path d="M102 44V24l14 6-14 6" className="fill-accent-soft" />
      <circle cx="46" cy="88" r="4" className="fill-surface" />
    </>
  ),
  /** Pay: a sun rising over the horizon. */
  sunrise: (
    <>
      <path d="M58 76a22 22 0 0 1 44 0" className="fill-accent-soft" />
      <path d="M44 76h72M52 86h56" />
      <path d="M80 34v8M57 44l5 5M103 44l-5 5M46 64h6M108 64h6" className="stroke-muted" />
    </>
  ),
  /** Envelopes and the 48-hour list: a sealed envelope. */
  envelope: (
    <>
      <rect x="46" y="36" width="68" height="46" rx="8" className="fill-surface" />
      <path d="M48 40l32 22 32-22" />
      <circle cx="80" cy="62" r="5" className="fill-accent-soft" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IllustrationName = keyof typeof SCENES

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return (
    <svg
      viewBox="0 0 160 112"
      width={160}
      height={112}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <ellipse cx="80" cy="60" rx="64" ry="46" className="fill-accent-soft" opacity="0.7" />
      <circle cx="126" cy="24" r="3" className="fill-accent" opacity="0.35" />
      <circle cx="30" cy="80" r="2" className="fill-accent" opacity="0.3" />
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-accent"
      >
        {SCENES[name]}
      </g>
    </svg>
  )
}
