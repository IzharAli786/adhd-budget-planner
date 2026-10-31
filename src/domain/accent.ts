// A custom accent colour (Settings > Theme). The picked colour must stay readable: as
// text on the background and cards, behind button text, and on its own soft tint. A
// colour that fails WCAG AA (4.5:1) there is refused, with the nearest shade that passes.
import type { Theme } from './settings'

export const HEX_COLOR = /^#[0-9a-f]{6}$/i
export const AA = 4.5

export type Mode = 'light' | 'dark'
interface Palette {
  bg: string
  surface: string
  text: string
  muted: string
  /** Text on an accent button: white in light mode, the background colour in dark. */
  onAccent: string
}

const light = (bg: string): Palette => ({
  bg,
  surface: '#ffffff',
  text: '#1f1e1c',
  muted: '#6b665e',
  onAccent: '#ffffff',
})
const dark = (bg: string, surface: string, muted = '#a8a196'): Palette => ({
  bg,
  surface,
  text: '#f3efe8',
  muted,
  onAccent: bg,
})

// A copy of app.css's --l-*/--d-* backgrounds and neutral text; accent.test.ts checks it
// against the stylesheet, so the two can't drift apart.
export const THEME_PALETTES: Record<Theme, Record<Mode, Palette>> = {
  clay: { light: light('#faf7f2'), dark: dark('#1f1e1c', '#2a2926') },
  sage: { light: light('#f6f7f2'), dark: dark('#1c1f1c', '#262a26') },
  ocean: { light: light('#f5f7f8'), dark: dark('#1b1e21', '#252a2e') },
  blush: { light: light('#fbf6f5'), dark: dark('#211d1e', '#2c2628') },
  sand: { light: light('#faf6ee'), dark: dark('#201e1a', '#2b2823') },
  // Dark-only, so its "light" palette is the dark one.
  midnight: {
    light: dark('#121826', '#1b2333', '#a3acc2'),
    dark: dark('#121826', '#1b2333', '#a3acc2'),
  },
}

type Triple = [number, number, number]

const toRgb = (hex: string): Triple =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Triple
const toHex = (rgb: Triple) =>
  `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

function luminance(hex: string) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as Triple
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 to 21. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** `t` of `a` over `b` in sRGB, like a tint painted on the card. */
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [toRgb(a), toRgb(b)]
  return toHex(x.map((v, i) => v * t + y[i]! * (1 - t)) as Triple)
}

function toHsl(hex: string): Triple {
  const [r, g, b] = toRgb(hex).map((v) => v / 255) as Triple
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

function fromHsl([h, s, l]: Triple): string {
  if (s === 0) return toHex([l * 255, l * 255, l * 255])
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    t = (t + 1) % 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return toHex([channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255])
}

export interface AccentPair {
  accent: string
  soft: string
}

// The soft tint is the accent washed into the card (light) or background (dark). A
// stronger tint looks richer, so the strongest one that keeps all text readable wins.
const TINTS: Record<Mode, readonly number[]> = {
  light: [0.12, 0.1, 0.08, 0.06, 0.04],
  dark: [0.15, 0.12, 0.09, 0.06, 0.03],
}

/** The accent with its soft tint if every pairing passes AA in this palette, else null. */
export function readablePair(accent: string, theme: Theme, mode: Mode): AccentPair | null {
  const p = THEME_PALETTES[theme][mode]
  const base = mode === 'light' ? p.surface : p.bg
  if (
    contrast(accent, p.bg) < AA ||
    contrast(accent, p.surface) < AA ||
    contrast(p.onAccent, accent) < AA
  )
    return null
  for (const t of TINTS[mode]) {
    const soft = mix(accent, base, t)
    if (
      contrast(accent, soft) >= AA &&
      contrast(p.text, soft) >= AA &&
      contrast(p.muted, soft) >= AA
    )
      return { accent, soft }
  }
  return null
}

/**
 * The closest readable shade: same hue and saturation, lightness nudged in small steps,
 * darker first in light mode and lighter first in dark mode. Always finds one, since
 * near-black (light) and near-white (dark) pass every pairing.
 */
export function nearestReadable(hex: string, theme: Theme, mode: Mode): AccentPair {
  const [h, s, l] = toHsl(hex)
  const dir = mode === 'light' ? -1 : 1
  for (let step = 0; step <= 400; step++) {
    for (const sign of step === 0 ? [1] : [dir, -dir]) {
      const nl = l + sign * step * 0.0025
      if (nl < 0 || nl > 1) continue
      const pair = readablePair(step === 0 ? hex.toLowerCase() : fromHsl([h, s, nl]), theme, mode)
      if (pair) return pair
    }
  }
  return readablePair(mode === 'light' ? '#000000' : '#ffffff', theme, mode)!
}

/** The mode a picked colour is judged in: what the person mostly sees in this theme. */
export const primaryMode = (theme: Theme): Mode => (theme === 'midnight' ? 'dark' : 'light')

export type AccentCheck = { ok: true } | { ok: false; suggestion: string }

/** Accept the colour as picked, or refuse it and name the nearest shade that passes. */
export function checkAccent(hex: string, theme: Theme): AccentCheck {
  const mode = primaryMode(theme)
  if (readablePair(hex.toLowerCase(), theme, mode)) return { ok: true }
  return { ok: false, suggestion: nearestReadable(hex, theme, mode).accent }
}

/**
 * Tokens for both modes. The picked colour is used as is where it passes; the other mode
 * gets its own nearest readable shade (a lighter one for dark mode, and vice versa). A
 * colour picked under another theme is nudged the same way if this one's background differs.
 */
export function accentTokens(hex: string, theme: Theme): Record<Mode, AccentPair> {
  return {
    light: nearestReadable(hex, theme, 'light'),
    dark: nearestReadable(hex, theme, 'dark'),
  }
}
