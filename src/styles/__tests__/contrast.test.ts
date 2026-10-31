import { describe, expect, it } from 'vitest'
import { THEMES } from '../../domain/settings'
import { readFileSync } from 'node:fs'

// Reads the real stylesheet, so a token edit that breaks WCAG AA fails CI (PLAN §8).
// (Vitest stubs CSS imports, ?raw included, so the file is read from disk.)
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')

// Neutral tokens are parsed from the stylesheet too, so editing --muted can't silently
// slip past the test the way hard-coded copies of the values would.
function hexes(block: string | undefined, what: string): Record<string, string> {
  if (!block) throw new Error(`No ${what} block in app.css`)
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
  )
}
const LIGHT = hexes(/\n:root\s*\{([^}]*)\}/.exec(css)?.[1], 'light :root')
const DARK = hexes(
  /:root\[data-mode='dark'\],\s*:root\[data-theme='midnight'\]\s*\{([^}]*)\}/.exec(css)?.[1],
  'dark',
)
const MIDNIGHT_MUTED = /:root\[data-theme='midnight'\]\s*\{\s*--muted:\s*(#[0-9a-f]{6})/i.exec(
  css,
)?.[1]

function tokens(theme: string): Record<string, string> {
  const block = new RegExp(`\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1]
  if (!block) throw new Error(`No token block for ${theme}`)
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!]),
  )
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

type Pair = [name: string, fg: string, bg: string]

function pairs(theme: string): Pair[] {
  const t = tokens(theme)
  const tok = (k: string) => {
    if (!t[k]) throw new Error(`${theme} is missing --${k}`)
    return t[k]
  }
  const muted = theme === 'midnight' ? MIDNIGHT_MUTED! : DARK.muted!
  const dark: Pair[] = [
    ['dark: text on bg', DARK.text!, tok('d-bg')],
    ['dark: text on surface', DARK.text!, tok('d-surface')],
    ['dark: text on accent-soft', DARK.text!, tok('d-accent-soft')],
    ['dark: text on danger-soft (danger button)', DARK.text!, DARK['danger-soft']!],
    ['dark: muted on bg', muted, tok('d-bg')],
    ['dark: muted on surface', muted, tok('d-surface')],
    ['dark: muted on accent-soft', muted, tok('d-accent-soft')],
    ['dark: accent on bg', tok('d-accent'), tok('d-bg')],
    ['dark: accent on surface', tok('d-accent'), tok('d-surface')],
    ['dark: accent on accent-soft', tok('d-accent'), tok('d-accent-soft')],
    ['dark: button text on accent', tok('d-bg'), tok('d-accent')],
  ]
  // Midnight is dark-only; its light palette is never shown with light text.
  if (theme === 'midnight') return dark
  return [
    ['text on bg', LIGHT.text!, tok('l-bg')],
    ['text on surface', LIGHT.text!, tok('l-surface')],
    ['text on accent-soft', LIGHT.text!, tok('l-accent-soft')],
    ['text on danger-soft (danger button)', LIGHT.text!, LIGHT['danger-soft']!],
    ['muted on bg', LIGHT.muted!, tok('l-bg')],
    ['muted on surface', LIGHT.muted!, tok('l-surface')],
    ['muted on accent-soft', LIGHT.muted!, tok('l-accent-soft')],
    ['accent on bg', tok('l-accent'), tok('l-bg')],
    ['accent on surface', tok('l-accent'), tok('l-surface')],
    ['accent on accent-soft', tok('l-accent'), tok('l-accent-soft')],
    ['button text on accent', LIGHT['accent-contrast']!, tok('l-accent')],
    ...dark,
  ]
}

it('finds the neutral tokens it checks', () => {
  for (const key of ['text', 'muted', 'accent-contrast', 'danger-soft'])
    expect(LIGHT[key]).toBeTruthy()
  for (const key of ['text', 'muted', 'danger-soft']) expect(DARK[key]).toBeTruthy()
  expect(MIDNIGHT_MUTED).toBeTruthy()
})

it.each([
  ['#000000', '#ffffff', 21],
  ['#ffffff', '#ffffff', 1],
  ['#767676', '#ffffff', 4.54],
])('computes the WCAG ratio of %s on %s as %d', (a, b, expected) => {
  expect(ratio(a, b)).toBeCloseTo(expected, 1)
})

describe.each(THEMES)('theme %s meets WCAG AA (4.5:1)', (theme) => {
  it.each(pairs(theme))('%s', (_, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
