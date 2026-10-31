import { accentTokens, HEX_COLOR } from '../domain/accent'
import type { Settings } from '../domain/settings'

type Appearance = Pick<Settings, 'theme' | 'mode' | 'largeText' | 'reducedMotion'> &
  Partial<Pick<Settings, 'accent'>>

const ACCENT_VARS = ['--l-accent', '--l-accent-soft', '--d-accent', '--d-accent-soft'] as const

/**
 * Mirrors appearance settings onto <html> as data attributes; app.css does the rest.
 * Attributes (not React state) because CSS must see them before first paint, and
 * because <dialog>s and toasts rendered outside the React tree should match too.
 */
export function applyAppearance(
  settings: Appearance,
  root: HTMLElement = document.documentElement,
) {
  root.dataset.theme = settings.theme
  root.dataset.mode = settings.mode
  root.dataset.motion = settings.reducedMotion === 'auto' ? 'auto' : settings.reducedMotion
  root.style.setProperty('--text-scale', `${settings.largeText}%`)
  // A custom accent overrides the theme's --l-*/--d-* accent tokens inline, so app.css's
  // light/dark switch keeps working unchanged. Derived per theme: each passes AA there.
  if (settings.accent && HEX_COLOR.test(settings.accent)) {
    const { light, dark } = accentTokens(settings.accent, settings.theme)
    const values = [light.accent, light.soft, dark.accent, dark.soft]
    ACCENT_VARS.forEach((name, i) => root.style.setProperty(name, values[i]!))
  } else {
    for (const name of ACCENT_VARS) root.style.removeProperty(name)
  }
  // Cached so the next cold start paints in the right theme before IndexedDB answers.
  try {
    localStorage.setItem('steady:appearance', JSON.stringify(settings))
  } catch {
    // Private mode: the first frame falls back to defaults, nothing worse.
  }
}

/** Applies the cached appearance synchronously at boot (no flash of the default theme). */
export function applyCachedAppearance(root: HTMLElement = document.documentElement) {
  try {
    const cached = localStorage.getItem('steady:appearance')
    if (cached) applyAppearance(JSON.parse(cached) as Appearance, root)
  } catch {
    // Corrupt or blocked cache: defaults are fine.
  }
}
