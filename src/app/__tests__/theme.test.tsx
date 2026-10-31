// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../../db/__tests__/helpers'
import { updateSettings } from '../../db/repos'
import { DEFAULT_SETTINGS } from '../../domain/settings'
import { SettingsProvider, useAppSettings } from '../SettingsProvider'
import { applyAppearance, applyCachedAppearance } from '../theme'

const root = () => document.documentElement

beforeEach(async () => {
  await resetDb()
  localStorage.clear()
  for (const key of ['theme', 'mode', 'motion']) delete root().dataset[key]
  root().style.removeProperty('--text-scale')
})
afterEach(cleanup)

describe('applyAppearance', () => {
  it.each([
    [
      { theme: 'sage', mode: 'dark', largeText: 130, reducedMotion: 'off' },
      ['sage', 'dark', 'off', '130%'],
    ],
    [
      { theme: 'midnight', mode: 'auto', largeText: 100, reducedMotion: 'auto' },
      ['midnight', 'auto', 'auto', '100%'],
    ],
    [
      { theme: 'blush', mode: 'light', largeText: 150, reducedMotion: 'on' },
      ['blush', 'light', 'on', '150%'],
    ],
  ] as const)('%o sets the html attributes', (settings, [theme, mode, motion, scale]) => {
    applyAppearance(settings)
    expect(root().dataset.theme).toBe(theme)
    expect(root().dataset.mode).toBe(mode)
    expect(root().dataset.motion).toBe(motion)
    expect(root().style.getPropertyValue('--text-scale')).toBe(scale)
  })

  it('a custom accent overrides the theme tokens for both modes, and clears again', () => {
    const base = { theme: 'clay', mode: 'auto', largeText: 100, reducedMotion: 'auto' } as const
    applyAppearance({ ...base, accent: '#2d6688' })
    expect(root().style.getPropertyValue('--l-accent')).toBe('#2d6688')
    // Dark mode gets its own, lighter shade of the same colour.
    const dark = root().style.getPropertyValue('--d-accent')
    expect(dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(dark).not.toBe('#2d6688')
    expect(root().style.getPropertyValue('--l-accent-soft')).toMatch(/^#[0-9a-f]{6}$/)
    applyAppearance({ ...base, accent: null })
    expect(root().style.getPropertyValue('--l-accent')).toBe('')
    expect(root().style.getPropertyValue('--d-accent-soft')).toBe('')
  })

  it('caches the appearance so the next start paints in the right theme at once', () => {
    applyAppearance({ theme: 'ocean', mode: 'dark', largeText: 115, reducedMotion: 'auto' })
    delete root().dataset.theme
    applyCachedAppearance()
    expect(root().dataset.theme).toBe('ocean')
  })
})

function ShowMode() {
  const { settings, loaded } = useAppSettings()
  return <p>{loaded ? `simple:${settings.simpleMode}` : 'loading'}</p>
}

describe('SettingsProvider', () => {
  it('applies stored settings to <html> and follows later changes', async () => {
    await updateSettings({ theme: 'sand', mode: 'dark', largeText: 130 })
    render(
      <SettingsProvider>
        <ShowMode />
      </SettingsProvider>,
    )
    await waitFor(() => expect(root().dataset.theme).toBe('sand'))
    expect(root().dataset.mode).toBe('dark')
    expect(root().style.getPropertyValue('--text-scale')).toBe('130%')
    expect(screen.getByText(`simple:${DEFAULT_SETTINGS.simpleMode}`)).toBeTruthy()

    await updateSettings({ theme: 'midnight', simpleMode: false })
    await waitFor(() => expect(root().dataset.theme).toBe('midnight'))
    await screen.findByText('simple:false')
  })
})
