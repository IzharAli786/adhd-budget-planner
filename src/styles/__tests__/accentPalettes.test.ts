import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEME_PALETTES } from '../../domain/accent'
import { THEMES } from '../../domain/settings'

// domain/accent.ts keeps a copy of each theme's backgrounds to judge custom accents
// against; this keeps that copy equal to the real stylesheet.
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')
const block = (theme: string) =>
  new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
const token = (body: string, name: string) =>
  new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(body)?.[1]?.toLowerCase()

describe('accent palettes', () => {
  it.each(THEMES)('%s mirrors the backgrounds in app.css', (theme) => {
    const t = block(theme)
    const p = THEME_PALETTES[theme]
    if (theme !== 'midnight') {
      expect(p.light.bg).toBe(token(t, 'l-bg'))
      expect(p.light.surface).toBe(token(t, 'l-surface'))
    }
    expect(p.dark.bg).toBe(token(t, 'd-bg'))
    expect(p.dark.surface).toBe(token(t, 'd-surface'))
  })
})
