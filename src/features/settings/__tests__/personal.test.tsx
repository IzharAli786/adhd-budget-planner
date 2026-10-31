// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import { exportBackup, validateBackup } from '../../../db/backup'
import * as r from '../../../db/repos'

const NOW = new Date(2026, 10, 4, 8, 30) // Wed 4 Nov 2026, 8:30 local

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  document.documentElement.style.cssText = ''
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const accentVar = () => document.documentElement.style.getPropertyValue('--l-accent')

describe('Settings: name and accent', () => {
  it('a display name greets on Today; without one it is just the time of day', async () => {
    await r.addIncome({
      name: 'Salary',
      amount: 210000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    })
    window.history.replaceState(null, '', '/')
    const { unmount } = render(<App />)
    expect(await screen.findByText('Good morning')).toBeTruthy()
    unmount()

    window.history.replaceState(null, '', '/more/settings')
    render(<App />)
    await userEvent.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Sam')
    await waitFor(async () => expect((await r.getSettings()).displayName).toBe('Sam'))
    cleanup()

    window.history.replaceState(null, '', '/')
    render(<App />)
    expect(await screen.findByText('Good morning, Sam')).toBeTruthy()
  })

  it('accepts a readable accent and applies it to the page', async () => {
    window.history.replaceState(null, '', '/more/settings')
    render(<App />)
    const input = await screen.findByLabelText('Accent colour')
    fireEvent.change(input, { target: { value: '#2d6688' } })
    await waitFor(async () => expect((await r.getSettings()).accent).toBe('#2d6688'))
    await waitFor(() => expect(accentVar()).toBe('#2d6688'))

    await userEvent.click(screen.getByRole('button', { name: 'Use the theme’s colour' }))
    await waitFor(async () => expect((await r.getSettings()).accent).toBeNull())
    await waitFor(() => expect(accentVar()).toBe(''))
  })

  it('refuses a colour that fails AA and offers the nearest passing shade', async () => {
    window.history.replaceState(null, '', '/more/settings')
    render(<App />)
    const input = await screen.findByLabelText('Accent colour')
    fireEvent.change(input, { target: { value: '#f4c542' } })
    expect(await screen.findByText(/hard to read/)).toBeTruthy()
    expect((await r.getSettings()).accent).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Use this shade' }))
    await waitFor(async () => expect((await r.getSettings()).accent).toMatch(/^#[0-9a-f]{6}$/))
    expect(screen.queryByText(/hard to read/)).toBeNull()
  })

  it('in dark mode a colour is judged on the dark background it will sit on', async () => {
    await r.updateSettings({ mode: 'dark' })
    window.history.replaceState(null, '', '/more/settings')
    render(<App />)
    const input = await screen.findByLabelText('Accent colour')
    // Pale yellow reads well on dark: accepted, not refused for failing on cream.
    fireEvent.change(input, { target: { value: '#f4c542' } })
    await waitFor(async () => expect((await r.getSettings()).accent).toBe('#f4c542'))
    expect(screen.queryByText(/hard to read/)).toBeNull()
    expect(await screen.findByText(/deeper shade of it in light mode/)).toBeTruthy()
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--d-accent')).toBe('#f4c542'),
    )
    // Light mode still gets a shade that passes there.
    expect(accentVar()).not.toBe('#f4c542')
  })

  it('both travel in a backup and validate on the way back', async () => {
    await r.updateSettings({ displayName: 'Sam', accent: '#2d6688' })
    const file = await exportBackup(NOW)
    const result = validateBackup(JSON.stringify(file))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const settings = result.backup.file.data.meta.find((m) => m.key === 'settings')?.value
    expect(settings).toMatchObject({ displayName: 'Sam', accent: '#2d6688' })

    const bad = structuredClone(file)
    const row = bad.data.meta.find((m) => m.key === 'settings')!
    row.value = { ...(row.value as object), accent: 'red' }
    expect(validateBackup(JSON.stringify(bad)).ok).toBe(false)
  })
})
