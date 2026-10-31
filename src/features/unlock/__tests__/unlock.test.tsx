// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb } from '../../../db/__tests__/helpers'
import { exportBackup } from '../../../db/backup'
import { getMeta } from '../../../db/repos'
import { FREE_TRIES } from '../UnlockScreen'

const DEV_CODE = 'STEADY-DEMO-0000-0000-0001'

beforeEach(async () => {
  await resetDb()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const input = () => screen.findByRole('textbox', { name: 'Unlock code' })
const unlockButton = () => screen.getByRole('button', { name: /Unlock|Checking/ })

describe('unlock screen (PLAN §7)', () => {
  it('locks the whole app, even deep links', async () => {
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome to Steady' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Main' })).toBeNull()
  })

  it('formats as you type and accepts a pasted code in any case', async () => {
    render(<App />)
    const field = (await input()) as HTMLInputElement
    await userEvent.type(field, 'demo0000')
    expect(field.value).toBe('DEM0-0000')
    fireEvent.change(field, { target: { value: 'steady demo 0000 0000 0001' } })
    expect(field.value).toBe('DEM0-0000-0000-0001')
  })

  it('unlocks with the dev code, persists the flag, and moves on to setup', async () => {
    render(<App />)
    fireEvent.change(await input(), { target: { value: DEV_CODE } })
    await userEvent.click(unlockButton())
    expect(await screen.findByRole('heading', { name: 'Before we start' })).toBeTruthy()
    expect(window.location.pathname).toBe('/setup')
    expect(await getMeta('unlocked')).toEqual({ at: expect.any(String), hashPrefix: '3b9b0537' })
  })

  it('never puts the unlock flag in a backup', async () => {
    render(<App />)
    fireEvent.change(await input(), { target: { value: DEV_CODE } })
    await userEvent.click(unlockButton())
    await screen.findByRole('heading', { name: 'Before we start' })
    const backup = await exportBackup()
    expect(backup.data.meta.map((m) => m.key)).not.toContain('unlocked')
  })

  it('rejects a wrong code kindly and stays locked', async () => {
    render(<App />)
    fireEvent.change(await input(), { target: { value: 'STEADY-DEMO-0000-0000-0002' } })
    await userEvent.click(unlockButton())
    expect(await screen.findByText(/didn’t match/)).toBeTruthy()
    expect(await getMeta('unlocked')).toBeUndefined()
    expect(screen.getByRole('textbox', { name: 'Unlock code' }).getAttribute('aria-invalid')).toBe(
      'true',
    )
  })

  it('says how much is missing from a short code', async () => {
    render(<App />)
    fireEvent.change(await input(), { target: { value: 'DEMO-00' } })
    await userEvent.click(unlockButton())
    expect(await screen.findByText(/6 of 16 characters/)).toBeTruthy()
  })

  it(`slows down by a second after ${FREE_TRIES} wrong tries`, async () => {
    render(<App />)
    const field = await input()
    for (let i = 0; i < FREE_TRIES; i++) {
      fireEvent.change(field, { target: { value: `STEADY-DEMO-0000-0000-00${10 + i}` } })
      fireEvent.submit(field.closest('form')!)
      await waitFor(() => expect(unlockButton().textContent).toBe('Unlock'))
    }
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    fireEvent.change(field, { target: { value: DEV_CODE } })
    fireEvent.submit(field.closest('form')!)
    expect(unlockButton().textContent).toBe('Checking…')
    await act(() => vi.advanceTimersByTimeAsync(900))
    expect(await getMeta('unlocked')).toBeUndefined()
    await act(() => vi.advanceTimersByTimeAsync(200))
    vi.useRealTimers()
    await waitFor(async () => expect(await getMeta('unlocked')).toBeTruthy())
  })

  it('offers the free demo', async () => {
    render(<App />)
    const link = await screen.findByRole('link', { name: /Try the free demo/ })
    expect(link.getAttribute('href')).toMatch(/^https:\/\//)
  })
})
