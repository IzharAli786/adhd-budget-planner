import { describe, expect, it } from 'vitest'
import { installContext, isInAppBrowser, isIOS } from '../install'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0 Mobile Safari/537.36',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0',
  etsyIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Etsy/7.0',
  facebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
}

const env = (userAgent: string, extra: Partial<Parameters<typeof isIOS>[0]> = {}) => ({
  userAgent,
  maxTouchPoints: 0,
  standaloneMedia: false,
  navigatorStandalone: false,
  ...extra,
})

describe('installContext (PLAN §6 matrix)', () => {
  it.each([
    ['iPhone Safari', env(UA.iphoneSafari, { maxTouchPoints: 5 }), false, 'ios'],
    [
      'iPhone Chrome (16.4+ can install too)',
      env(UA.iphoneChrome, { maxTouchPoints: 5 }),
      false,
      'ios',
    ],
    ['iPad pretending to be a Mac', env(UA.ipadOS, { maxTouchPoints: 5 }), false, 'ios'],
    [
      'iPhone home-screen app',
      env(UA.iphoneSafari, { navigatorStandalone: true }),
      false,
      'installed',
    ],
    ['Android installed PWA', env(UA.androidChrome, { standaloneMedia: true }), true, 'installed'],
    ['Instagram in-app browser', env(UA.instagram), false, 'in-app'],
    ['Etsy app browser', env(UA.etsyIOS), false, 'in-app'],
    ['Facebook in-app browser', env(UA.facebook), false, 'in-app'],
    ['Android WebView', env(UA.androidWebView), false, 'in-app'],
    ['Android Chrome with a prompt', env(UA.androidChrome), true, 'prompt'],
    ['Desktop Chrome with a prompt', env(UA.desktopChrome), true, 'prompt'],
    ['Desktop Chrome before the prompt fires', env(UA.desktopChrome), false, 'unsupported'],
    ['Mac Safari (no touch)', env(UA.macSafari), false, 'unsupported'],
  ])('%s -> %s', (_, e, canPrompt, expected) => {
    expect(installContext(e, canPrompt)).toBe(expected)
  })

  it('treats iPhone Chrome as iOS but not as in-app', () => {
    const e = env(UA.iphoneChrome, { maxTouchPoints: 5 })
    expect(isIOS(e)).toBe(true)
    expect(isInAppBrowser(e)).toBe(false)
  })
})
