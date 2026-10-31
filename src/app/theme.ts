import type { Settings } from '../domain/settings'

type Appearance = Pick<Settings, 'theme' | 'mode' | 'largeText' | 'reducedMotion'>

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
