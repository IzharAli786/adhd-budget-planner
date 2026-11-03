// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { captureInstallPrompt, installBannerDismissed } from '../../../lib/install'
import { InstallBanner } from '../../install/InstallGate'

// Wed 4 Nov 2026, noon local.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const goto = (path: string) => window.history.replaceState(null, '', path)

describe('More › How each part works', () => {
  it('opens from More: a card per tab and the common questions', async () => {
    goto('/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /How each part works/ }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'How each part works' }),
    ).toBeTruthy()
    // Getting started, every section in menu order, then More.
    const parts = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
      .filter((t) => t !== 'Questions')
    expect(parts).toEqual([
      'Getting started',
      'Home',
      'Today',
      'Calendar',
      'Goals',
      'Savings',
      'Debt',
      'Envelopes',
      'Yearly review',
      'Settings',
      'More',
    ])
    for (const q of [/offline/, /backups/, /estimate/, /Simple or Full/, /private/])
      expect(screen.getByText(q, { selector: 'summary span' })).toBeTruthy()
    expect(screen.getByText('Estimates only, not financial advice.')).toBeTruthy()
  })
})

describe('Add your rent: one tap to the bill form', () => {
  it('/bills?new=1 opens the form, and the address drops the flag', async () => {
    goto('/bills?new=1')
    render(<App />)
    const sheet = await screen.findByRole('dialog', { name: 'Add a bill' })
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toBeTruthy()
    expect(window.location.search).toBe('')
  })
})

describe('More', () => {
  const sectionRows = () =>
    within(screen.getByRole('main'))
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'))
      .filter((href) =>
        ['/getting-started', '/goals', '/savings', '/debt', '/review', '/more/settings'].includes(
          href ?? '',
        ),
      )

  it('lists the sections the phone’s tab bar has no room for, first and in menu order', async () => {
    await r.updateSettings({ simpleMode: false })
    goto('/more')
    render(<App />)
    const group = await screen.findByRole('heading', { name: 'Sections' })
    expect(group).toBeTruthy()
    expect(sectionRows()).toEqual([
      '/getting-started',
      '/goals',
      '/savings',
      '/debt',
      '/review',
      '/more/settings',
    ])
    const main = within(screen.getByRole('main'))
    for (const name of [/Getting started/, /Goals/, /Savings/, /Debt/, /Yearly review/, /Settings/])
      expect(main.getByRole('link', { name })).toBeTruthy()
    // The old rows that led to the same places are gone.
    expect(main.queryByRole('link', { name: /Look back/ })).toBeNull()
    expect(main.queryByRole('link', { name: /Debt payoff/ })).toBeNull()
    expect(main.queryByRole('link', { name: /Appearance & settings/ })).toBeNull()
    // The rest is still here.
    for (const name of [
      /Transactions/,
      /Backup & restore/,
      /Recently deleted/,
      /48-hour list/,
      /How each part works/,
    ])
      expect(main.getByRole('link', { name })).toBeTruthy()
  })

  it('in Simple mode only offers the sections that exist', async () => {
    await r.updateSettings({ simpleMode: true })
    goto('/more')
    render(<App />)
    await screen.findByRole('heading', { name: 'Sections' })
    expect(sectionRows()).toEqual(['/getting-started', '/more/settings'])
  })

  it('a row opens its section', async () => {
    await r.updateSettings({ simpleMode: false })
    goto('/more')
    render(<App />)
    await screen.findByRole('heading', { name: 'Sections' })
    await userEvent.click(
      within(screen.getByRole('main')).getByRole('link', { name: /Yearly review/ }),
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Yearly review' })).toBeTruthy()
  })
})

describe('install banner', () => {
  it('"Not now" stays dismissed after a reload', async () => {
    // A browser that offers the native install dialog.
    captureInstallPrompt(window)
    const prompt = Object.assign(new Event('beforeinstallprompt'), {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    })
    window.dispatchEvent(prompt)

    const first = render(<InstallBanner />)
    expect(await screen.findByText(/Install Steady to use it offline/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByText(/Install Steady/)).toBeNull()

    // A reload: a fresh component with only what this device remembered.
    first.unmount()
    render(<InstallBanner />)
    expect(screen.queryByText(/Install Steady/)).toBeNull()
    expect(installBannerDismissed()).toBe(true)
  })
})
