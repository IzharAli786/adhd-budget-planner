// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dexie } from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import { archiveFileName } from '../../../db/backup'
import * as r from '../../../db/repos'
import { db } from '../../../db/schema'
import { snapshotDbName, writeSnapshot } from '../../../db/snapshot'

const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  await r.updateSettings({ displayName: 'Sam', accent: '#2d6688' })
  await r.addTransaction({ date: '2026-11-02', amount: -1200, note: 'coffee' })
  await r.addFund({ name: 'Holiday', perPeriod: 5000, openingSaved: 0 })
  localStorage.setItem('steady:appearance', '{"theme":"sage"}')
  window.history.replaceState(null, '', '/more/backup')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const counts = async () =>
  Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.count()])))

describe('Backup: erase everything', () => {
  it('names the consequences and offers a backup first; Cancel changes nothing', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Erase everything/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Erase everything on this device?' })
    expect(within(dialog).getByText('This can’t be undone.')).toBeTruthy()
    expect(within(dialog).getByText(/unlock code again/)).toBeTruthy()
    expect(within(dialog).getByText(/Every entry, bill/)).toBeTruthy()
    expect(await within(dialog).findByRole('link', { name: 'Save a backup first' })).toBeTruthy()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await db.transactions.count()).toBe(1)
  })

  it('erases every table, the unlock flag and the safety copies, then asks for the code', async () => {
    await writeSnapshot(db, 'import', NOW)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Erase everything/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Erase everything on this device?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Erase everything' }))

    expect(await screen.findByRole('heading', { name: 'Welcome to Steady' })).toBeTruthy()
    const after = await counts()
    expect(Object.values(after).every((n) => n === 0)).toBe(true)
    expect(await r.getMeta('unlocked')).toBeUndefined()
    expect(await Dexie.exists(snapshotDbName(db.name))).toBe(false)
    expect(localStorage.getItem('steady:appearance')).not.toContain('sage')
    // The custom accent is gone from <html> with the settings it came from.
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--l-accent')).toBe(''),
    )
  })
})

describe('Backup: save this year as a file', () => {
  it('offers the full backup named for the year', async () => {
    render(<App />)
    // The archive is a full export through fake IndexedDB; on a loaded machine that can
    // take longer than findBy's default second, while the button still says "Preparing…".
    const link = await screen.findByRole(
      'link',
      { name: 'Save this year as a file' },
      { timeout: 5000 },
    )
    expect(link.getAttribute('download')).toBe(archiveFileName('2026'))
    expect(archiveFileName('2026')).toBe('steady-2026-archive.json')
  })
})
