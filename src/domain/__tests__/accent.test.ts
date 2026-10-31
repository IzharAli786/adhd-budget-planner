import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  AA,
  accentTokens,
  checkAccent,
  contrast,
  nearestReadable,
  readablePair,
  THEME_PALETTES,
} from '../accent'
import { THEMES } from '../settings'

const hex = fc
  .tuple(fc.nat(255), fc.nat(255), fc.nat(255))
  .map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`)

describe('checkAccent', () => {
  it('accepts a deep colour on the light themes', () => {
    expect(checkAccent('#2d6688', 'ocean')).toEqual({ ok: true })
    expect(checkAccent('#A9502B', 'clay')).toEqual({ ok: true })
  })

  it('refuses a pale colour and suggests a darker shade of it that passes', () => {
    const result = checkAccent('#f4c542', 'clay') // sunflower yellow: unreadable on cream
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(checkAccent(result.suggestion, 'clay')).toEqual({ ok: true })
    expect(contrast(result.suggestion, '#ffffff')).toBeGreaterThanOrEqual(AA)
  })

  it('judges Midnight against its dark background', () => {
    expect(checkAccent('#2d6688', 'midnight').ok).toBe(false)
    expect(checkAccent('#9db2ff', 'midnight')).toEqual({ ok: true })
  })

  it('suggests the nearest passing shade: no closer lightness passes', () => {
    const { accent } = nearestReadable('#7fb3d5', 'ocean', 'light')
    expect(readablePair(accent, 'ocean', 'light')).not.toBeNull()
    expect(accent).not.toBe('#7fb3d5')
  })
})

describe('accentTokens', () => {
  it('keeps a passing colour as is in its own mode', () => {
    expect(accentTokens('#4a7455', 'sage').light.accent).toBe('#4a7455')
  })

  it('every derived pair passes AA in both modes, for any colour and theme', () => {
    fc.assert(
      fc.property(hex, fc.constantFrom(...THEMES), (color, theme) => {
        const tokens = accentTokens(color, theme)
        for (const mode of ['light', 'dark'] as const) {
          const p = THEME_PALETTES[theme][mode]
          const { accent, soft } = tokens[mode]
          expect(contrast(accent, p.bg)).toBeGreaterThanOrEqual(AA)
          expect(contrast(accent, p.surface)).toBeGreaterThanOrEqual(AA)
          expect(contrast(accent, soft)).toBeGreaterThanOrEqual(AA)
          expect(contrast(p.onAccent, accent)).toBeGreaterThanOrEqual(AA)
          expect(contrast(p.text, soft)).toBeGreaterThanOrEqual(AA)
          expect(contrast(p.muted, soft)).toBeGreaterThanOrEqual(AA)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('a checked colour that passes is what the light tokens use', () => {
    fc.assert(
      fc.property(hex, (color) => {
        if (checkAccent(color, 'clay').ok)
          expect(accentTokens(color, 'clay').light.accent).toBe(color)
      }),
    )
  })
})
