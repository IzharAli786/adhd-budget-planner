import { describe, expect, it } from 'vitest'
import { ENVELOPE_COLORS } from '../../domain/categories'
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
  for (const key of ['text', 'muted', 'accent-contrast', 'control-border', 'toast-success'])
    expect(LIGHT[key]).toBeTruthy()
  for (const key of ['text', 'muted', 'control-border', 'toast-success'])
    expect(DARK[key]).toBeTruthy()
  expect(MIDNIGHT_MUTED).toBeTruthy()
})

it('has no danger-soft token: its job moved to the attention tone', () => {
  expect(css).not.toMatch(/--(color-)?danger-soft/)
})

it.each([
  ['#000000', '#ffffff', 21],
  ['#ffffff', '#ffffff', 1],
  ['#767676', '#ffffff', 4.54],
])('computes the WCAG ratio of %s on %s as %d', (a, b, expected) => {
  expect(ratio(a, b)).toBeCloseTo(expected, 1)
})

// OKLab distance: how far apart two colours look (0 = the same; the palette's own closest
// pair, clay and amber, is about 0.04).
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
const apart = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

describe('envelope colours', () => {
  // The palette keys, plus Everyday's own colour (the default envelope, stored as 'accent').
  const KEYS = [...ENVELOPE_COLORS, 'everyday']
  // Every declaration in order: the light block, then the two dark blocks.
  const decls = [...css.matchAll(/--env-([\w]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!])
  const light = Object.fromEntries(decls.slice(0, KEYS.length))
  const darkMedia = Object.fromEntries(decls.slice(KEYS.length, 2 * KEYS.length))
  const darkForced = Object.fromEntries(decls.slice(2 * KEYS.length))

  it('defines every palette key and Everyday once per mode, the same dark value in both dark blocks', () => {
    expect(decls).toHaveLength(3 * KEYS.length)
    for (const block of [light, darkMedia, darkForced])
      expect(Object.keys(block).sort()).toEqual([...KEYS].sort())
    expect(darkForced).toEqual(darkMedia)
    expect(new Set(Object.values(light)).size).toBe(KEYS.length)
    expect(new Set(Object.values(darkMedia)).size).toBe(KEYS.length)
  })

  // Everyday sits next to every other envelope in the charts, so it must not pass for one
  // of them: at least twice as far from each as the palette's own closest pair.
  it.each(ENVELOPE_COLORS)('Everyday is easy to tell from %s in light and dark', (key) => {
    expect(apart(light.everyday!, light[key]!)).toBeGreaterThanOrEqual(0.08)
    expect(apart(darkMedia.everyday!, darkMedia[key]!)).toBeGreaterThanOrEqual(0.08)
  })

  // Non-text marks (dots, bars): WCAG 1.4.11 asks 3:1 against what they sit on.
  const surfaces = (prefix: 'l' | 'd') =>
    THEMES.filter((t) => prefix === 'd' || t !== 'midnight').flatMap((t) => {
      const tk = tokens(t)
      return [tk[`${prefix}-bg`]!, tk[`${prefix}-surface`]!].map((bg) => [t, bg] as const)
    })
  it.each(KEYS)('%s is 3:1 on every light and dark surface', (key) => {
    for (const [, bg] of surfaces('l')) expect(ratio(light[key]!, bg)).toBeGreaterThanOrEqual(3)
    for (const [, bg] of surfaces('d')) expect(ratio(darkMedia[key]!, bg)).toBeGreaterThanOrEqual(3)
  })
})

describe.each(THEMES)('theme %s meets WCAG AA (4.5:1)', (theme) => {
  it.each(pairs(theme))('%s', (_, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})

// Chart series (Insights, Look back) sit on any theme's surface or background. WCAG asks
// 3:1 of graphics; we hold them to the text bar (4.5:1) so a slice's colour alone reads.
const series = (palette: Record<string, string>) =>
  Object.entries(palette).filter(([k]) => k.startsWith('chart-'))

it('defines six chart series in light and dark', () => {
  expect(series(LIGHT)).toHaveLength(6)
  expect(series(DARK)).toHaveLength(6)
})

describe.each(THEMES)('theme %s: chart colours stand out', (theme) => {
  const t = tokens(theme)
  const on = (mode: string, palette: Record<string, string>, surface: string, bg: string) =>
    series(palette).flatMap(([k, c]): Pair[] => [
      [`${mode}: ${k} on surface`, c, surface],
      [`${mode}: ${k} on bg`, c, bg],
    ])
  const cases = [
    ...(theme === 'midnight' ? [] : on('light', LIGHT, t['l-surface']!, t['l-bg']!)),
    ...on('dark', DARK, t['d-surface']!, t['d-bg']!),
  ]
  it.each(cases)('%s', (_, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})

// Status tones (design spec §2.1): one light set and one dark set for every theme, with
// Midnight's own neutral and control edge. Text pairs need 4.5:1; state edges and fills
// that carry no words (unchecked box, switch knob, progress fill, focus ring) need 3:1.
const TONES = ['neutral', 'progress', 'success', 'attention', 'info'] as const
const block = (re: RegExp, what: string) => {
  const body = re.exec(css)?.[1]
  if (!body) throw new Error(`No ${what} block in app.css`)
  return body
}
const DARK_MEDIA_BLOCK = block(
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-mode='light'\]\)\s*\{([^}]*)\}/,
  'dark media',
)
const DARK_FORCED_BLOCK = block(
  /:root\[data-mode='dark'\],\s*:root\[data-theme='midnight'\]\s*\{([^}]*)\}/,
  'forced dark',
)
const MIDNIGHT = hexes(
  /:root\[data-theme='midnight'\]\s*\{(\s*--muted:[^}]*)\}/.exec(css)?.[1],
  'midnight override',
)

// color-mix(in oklab, a pct%, b): --track and --selected-bg are mixes, not hexes.
function hexFromOklab([L, A, B]: [number, number, number]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${rgb
    .map((c) => {
      const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
      return Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')}`
}
const mix = (a: string, pct: number, b: string) => {
  const [x, y] = [oklab(a), oklab(b)]
  return hexFromOklab(
    [0, 1, 2].map((i) => x[i]! * pct + y[i]! * (1 - pct)) as [number, number, number],
  )
}
const declared = (body: string, name: string) =>
  new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1]?.trim()

it('mixes colours the way color-mix(in oklab) does', () => {
  expect(mix('#000000', 0, '#ffffff')).toBe('#ffffff')
  expect(mix('#000000', 1, '#ffffff')).toBe('#000000')
  expect(mix('#3d6e8f', 0.5, '#3d6e8f')).toBe('#3d6e8f')
})

it('declares the --track and --selected-bg mixes the contrast checks assume', () => {
  const light = block(/\n:root\s*\{([^}]*)\}/, 'light :root')
  expect(declared(light, 'track')).toBe('color-mix(in oklab, var(--text) 10%, var(--surface))')
  expect(declared(light, 'selected-bg')).toBe('var(--surface)')
  for (const dark of [DARK_MEDIA_BLOCK, DARK_FORCED_BLOCK])
    expect(declared(dark, 'selected-bg')).toBe(
      'color-mix(in oklab, var(--text) 12%, var(--surface))',
    )
})

it('declares every tone, the control edge and the toast check once per mode', () => {
  const keys = [
    ...TONES.flatMap((t) => ['fg', 'bg', 'border'].map((part) => `tone-${t}-${part}`)),
    'control-border',
    'toast-success',
  ]
  const pick = (palette: Record<string, string>) =>
    Object.fromEntries(keys.map((k) => [k, palette[k]]))
  for (const palette of [LIGHT, DARK, hexes(DARK_MEDIA_BLOCK, 'dark media')])
    for (const k of keys) expect(palette[k], k).toMatch(/^#[0-9a-f]{6}$/i)
  // The OS-dark block and the forced-dark block must never drift apart.
  expect(pick(hexes(DARK_MEDIA_BLOCK, 'dark media'))).toEqual(pick(DARK))
  // Midnight overrides its neutral and control edge (plus --muted), and cools the other
  // tones' fills toward its navy; their text colours stay the shared dark set.
  expect(Object.keys(MIDNIGHT).sort()).toEqual(
    [
      'control-border',
      'muted',
      'tone-attention-bg',
      'tone-attention-border',
      'tone-neutral-bg',
      'tone-neutral-border',
      'tone-neutral-fg',
      'tone-progress-bg',
      'tone-success-bg',
      'tone-success-border',
    ].sort(),
  )
})

interface ToneMode {
  mode: 'light' | 'dark'
  palette: Record<string, string>
  surface: string
  bg: string
  accent: string
}
function toneModes(theme: string): ToneMode[] {
  const t = tokens(theme)
  const dark: ToneMode = {
    mode: 'dark',
    palette: theme === 'midnight' ? { ...DARK, ...MIDNIGHT } : DARK,
    surface: t['d-surface']!,
    bg: t['d-bg']!,
    accent: t['d-accent']!,
  }
  if (theme === 'midnight') return [dark]
  const light: ToneMode = {
    mode: 'light',
    palette: LIGHT,
    surface: t['l-surface']!,
    bg: t['l-bg']!,
    accent: t['l-accent']!,
  }
  return [light, dark]
}

describe.each(THEMES)('theme %s: status tones', (theme) => {
  const text: Pair[] = []
  const nonText: Pair[] = []
  for (const { mode, palette, surface, bg, accent } of toneModes(theme)) {
    const k = (name: string) => {
      const v = palette[name]
      if (!v) throw new Error(`${theme} ${mode} is missing --${name}`)
      return v
    }
    for (const tone of TONES) {
      const fg = k(`tone-${tone}-fg`)
      const fill = k(`tone-${tone}-bg`)
      text.push(
        // Badge text, and (fg on surface) the surface-coloured tick on a solid tone fill.
        [`${mode}: ${tone} on its own fill`, fg, fill],
        [`${mode}: ${tone} on surface`, fg, surface],
        [`${mode}: ${tone} on bg`, fg, bg],
        // Notice body text and captions sit on the tone fills.
        [`${mode}: text on the ${tone} fill`, k('text'), fill],
        [`${mode}: muted on the ${tone} fill`, k('muted'), fill],
      )
    }
    text.push([`${mode}: success check on the inverted toast`, k('toast-success'), k('text')])
    const control = k('control-border')
    nonText.push(
      [`${mode}: control edge on surface`, control, surface],
      // Also the selected segment's ring on its track (the track is bg); the lifted fill
      // inside it is a bonus, not the cue.
      [`${mode}: control edge on bg`, control, bg],
      [`${mode}: control edge on the neutral fill`, control, k('tone-neutral-bg')],
      // Text fields (inputClass) use the same edge, so a field is findable in a dark sheet.
      [`${mode}: text field edge on surface`, control, surface],
      [`${mode}: text field edge on bg`, control, bg],
      [`${mode}: accent fill on the progress track`, accent, mix(k('text'), 0.1, surface)],
      [`${mode}: toast focus ring (page colour) on the toast`, bg, k('text')],
    )
  }
  it.each(text)('%s is 4.5:1', (_, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
  it.each(nonText)('%s is 3:1', (_, fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(3)
  })
})
