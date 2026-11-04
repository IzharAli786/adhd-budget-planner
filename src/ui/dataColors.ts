// Data identity colours: which series or kind of money, never a status (that is --tone-*)
// and never an action (that is --accent). One mapping for every chart in the app, so
// money in is always green and debt always plum, whichever theme is on.
export const DATA_COLOR = {
  in: 'var(--env-sage)',
  out: 'var(--env-slate)',
  bills: 'var(--env-slate)',
  spending: 'var(--env-amber)',
  envelopes: 'var(--env-amber)',
  debt: 'var(--env-plum)',
  savings: 'var(--env-ocean)',
  free: 'var(--env-sage)',
} as const

export type DataColorKey = keyof typeof DATA_COLOR

/** A soft fill of a data colour on the surface: a bar's track, a planned bar's body. */
export const tint = (color: string, pct = 16) =>
  `color-mix(in oklab, ${color} ${pct}%, var(--surface))`
