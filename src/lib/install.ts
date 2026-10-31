// Install detection (PLAN §6 matrix). Data saved in a Safari tab and data saved in the
// home-screen app live in DIFFERENT storage on iOS, so we push for install before setup.
// Every check takes its inputs as parameters (defaulting to the real browser) so the
// matrix is unit-testable without faking globals.

/**
 * The demo has no service worker and must never ask to be installed (PLAN §7): an
 * installed demo would strand a buyer on sample data in a separate storage silo.
 */
export const INSTALL_FLOW = import.meta.env.MODE !== 'demo'

export type InstallContext = 'installed' | 'in-app' | 'ios' | 'prompt' | 'unsupported'

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface Env {
  userAgent: string
  maxTouchPoints: number
  standaloneMedia: boolean
  /** iOS-only flag set when launched from the home screen. */
  navigatorStandalone: boolean
}

function browserEnv(): Env {
  const nav = globalThis.navigator as (Navigator & { standalone?: boolean }) | undefined
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standaloneMedia:
      typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
    navigatorStandalone: nav?.standalone === true,
  }
}

export const isStandalone = (env: Env = browserEnv()) =>
  env.standaloneMedia || env.navigatorStandalone

// iPadOS 13+ reports itself as a Mac; touch points give it away.
export const isIOS = (env: Env = browserEnv()) =>
  /iPhone|iPad|iPod/.test(env.userAgent) ||
  (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1)

// Embedded webviews can't install and often wipe storage. Etsy, Instagram, Facebook,
// TikTok, LinkedIn, Pinterest, Gmail/Google app and Android WebViews ("; wv)").
const IN_APP =
  /Etsy|Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|LinkedInApp|Pinterest|GSA\/|Line\/|; wv\)/i

export const isInAppBrowser = (env: Env = browserEnv()) => IN_APP.test(env.userAgent)

export function installContext(
  env: Env = browserEnv(),
  canPrompt = hasInstallPrompt(),
): InstallContext {
  if (isStandalone(env)) return 'installed'
  if (isInAppBrowser(env)) return 'in-app'
  if (isIOS(env)) return 'ios'
  return canPrompt ? 'prompt' : 'unsupported'
}

// beforeinstallprompt fires once, early, often before React mounts. Capture it at module
// load and let components subscribe, or the event is lost.
let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function captureInstallPrompt(target: Window = window) {
  target.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep the mini-infobar away; we show our own button
    deferred = e as BeforeInstallPromptEvent
    notify()
  })
  target.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

export const hasInstallPrompt = () => deferred !== null

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shows the native install dialog. The event is single-use, so it is cleared after. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = deferred
  if (!event) return 'unavailable'
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome
}

const CONTINUE_KEY = 'steady:continue-in-browser'
const BANNER_KEY = 'steady:install-banner-dismissed'

/**
 * "Not now" on the install banner, remembered on this device. Per device on purpose: it
 * is about this browser, and a restored backup on a new phone should still offer it.
 */
export function installBannerDismissed(): boolean {
  try {
    return localStorage.getItem(BANNER_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissInstallBanner() {
  try {
    localStorage.setItem(BANNER_KEY, '1')
  } catch {
    // Private mode: hidden for this visit only.
  }
}

/** "Continue in browser" is a per-device choice about this tab, not user data. */
export function continuedInBrowser(): boolean {
  try {
    return localStorage.getItem(CONTINUE_KEY) === '1'
  } catch {
    return false
  }
}

export function setContinuedInBrowser(value: boolean) {
  try {
    if (value) localStorage.setItem(CONTINUE_KEY, '1')
    else localStorage.removeItem(CONTINUE_KEY)
  } catch {
    // Private mode: the gate simply shows again next time.
  }
}
