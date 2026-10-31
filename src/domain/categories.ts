// Envelope colours and the "common categories" starter set. Colours are stored as palette
// keys, never hex: the hex lives in app.css (one value per light/dark), so a theme or mode
// change recolours every envelope, and contrast.test.ts checks each against every surface.
import type { Envelope } from './types'

export const ENVELOPE_COLORS = [
  'clay',
  'sage',
  'ocean',
  'sand',
  'rose',
  'plum',
  'teal',
  'slate',
  'olive',
  'amber',
] as const
export type EnvelopeColor = (typeof ENVELOPE_COLORS)[number]

/** Everyday (and rows from before colours existed) use 'accent', the theme's own colour. */
export const isPaletteColor = (color: string): color is EnvelopeColor =>
  (ENVELOPE_COLORS as readonly string[]).includes(color)

export interface StarterCategory {
  name: string
  color: EnvelopeColor
}

/** Ten calm, distinct colours: no two neighbours in this list share a hue family. */
export const STARTER_CATEGORIES: readonly StarterCategory[] = [
  { name: 'Rent & housing', color: 'clay' },
  { name: 'Groceries', color: 'sage' },
  { name: 'Eating out', color: 'amber' },
  { name: 'Transport', color: 'ocean' },
  { name: 'Bills & utilities', color: 'slate' },
  { name: 'Subscriptions', color: 'plum' },
  { name: 'Personal care', color: 'rose' },
  { name: 'Fun', color: 'teal' },
  { name: 'Gifts', color: 'sand' },
  { name: 'Other', color: 'olive' },
]

const key = (name: string) => name.trim().toLowerCase()

/**
 * The starter categories not already there (by name, ignoring case and deleted rows), so a
 * second tap, or a person who already made "Groceries", never ends up with duplicates.
 */
export function missingStarters(
  existing: readonly Pick<Envelope, 'name' | 'deletedAt'>[],
): StarterCategory[] {
  const have = new Set(existing.filter((e) => e.deletedAt === undefined).map((e) => key(e.name)))
  return STARTER_CATEGORIES.filter((c) => !have.has(key(c.name)))
}

/**
 * A colour for a new envelope: the first palette colour no live envelope uses yet, then
 * round-robin, so envelopes stay tellable apart for as long as the palette allows.
 */
export function nextEnvelopeColor(
  existing: readonly Pick<Envelope, 'color' | 'deletedAt'>[],
): EnvelopeColor {
  const live = existing.filter((e) => e.deletedAt === undefined)
  const used = new Set(live.map((e) => e.color))
  return (
    ENVELOPE_COLORS.find((c) => !used.has(c)) ??
    ENVELOPE_COLORS[live.length % ENVELOPE_COLORS.length]!
  )
}
