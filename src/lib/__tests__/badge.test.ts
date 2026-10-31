import { describe, expect, it } from 'vitest'
import { badgeEnabled, badgePlatform, type BadgePlatform } from '../badge'

describe('badgePlatform', () => {
  it.each<[boolean, boolean, BadgePlatform]>([
    [false, false, 'none'],
    [false, true, 'none'],
    [true, false, 'chromium'],
    [true, true, 'ios'],
  ])('api %s, iOS %s -> %s', (api, ios, expected) => expect(badgePlatform(api, ios)).toBe(expected))
})

describe('badgeEnabled', () => {
  it.each<[BadgePlatform, boolean | null, boolean]>([
    // Chromium: on by default, the user can turn it off.
    ['chromium', null, true],
    ['chromium', false, false],
    ['chromium', true, true],
    // iOS: only after the opt-in in Settings.
    ['ios', null, false],
    ['ios', true, true],
    ['ios', false, false],
    ['none', true, false],
  ])('%s with pref %s -> %s', (platform, pref, expected) =>
    expect(badgeEnabled(platform, pref)).toBe(expected),
  )
})
