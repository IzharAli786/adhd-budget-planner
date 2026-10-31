// The app-icon badge (PLAN §6). Chromium shows it for installed apps with no permission,
// so it is on by default there. iOS only shows it after the user allows notifications,
// so there it stays off until they opt in from Settings.
import { isIOS } from './install'

export type BadgePlatform = 'chromium' | 'ios' | 'none'

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const nav = () => globalThis.navigator as BadgeNavigator | undefined

export function badgePlatform(
  hasBadgeApi = typeof nav()?.setAppBadge === 'function',
  ios = isIOS(),
): BadgePlatform {
  if (!hasBadgeApi) return 'none'
  return ios ? 'ios' : 'chromium'
}

/** `pref` is the Settings switch: null until the user touches it. */
export function badgeEnabled(platform: BadgePlatform, pref: boolean | null): boolean {
  if (platform === 'chromium') return pref !== false
  if (platform === 'ios') return pref === true
  return false
}

export async function setBadge(count: number): Promise<void> {
  const n = nav()
  try {
    if (count > 0) await n?.setAppBadge?.(count)
    else await n?.clearAppBadge?.()
  } catch {
    // Not installed, or permission withdrawn: a missing badge is never worth an error.
  }
}

/** iOS needs notification permission before it shows a badge. */
export async function askBadgePermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}
