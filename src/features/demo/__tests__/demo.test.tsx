// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { App } from '../../../app/App'
import { SettingsProvider } from '../../../app/SettingsProvider'
import { getDemoState, DEMO_CAP } from '../../../db/demo'
import * as r from '../../../db/repos'
import { db } from '../../../db/schema'
import { seedDemo } from '../../../db/seed/demo'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import { etsyUrl } from '../../../lib/demo'
import { ToastProvider } from '../../../ui/Toast'
import { DemoGate } from '../DemoGate'

// Sat 31 Oct 2026, 10:00 local.
const NOW = new Date(2026, 9, 31, 10, 0)

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>
}

function renderGate() {
  return render(
    <BrowserRouter>
      <SettingsProvider>
        <ToastProvider>
          <DemoGate>
            <Routes>
              <Route path="*" element={<p>The app</p>} />
            </Routes>
          </DemoGate>
          <Where />
        </ToastProvider>
      </SettingsProvider>
    </BrowserRouter>,
  )
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('demo gate', () => {
  it('offers two ways in, under a banner that links to Etsy and nothing else', async () => {
    renderGate()
    expect(await screen.findByRole('heading', { name: 'Try Steady' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Look around with sample data/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Try with my own numbers/ })).toBeTruthy()
    const banner = screen.getByRole('region', { name: 'Demo' })
    expect(banner.textContent).toContain('Free demo')
    const link = within(banner).getByRole('link', { name: /Get the full app on Etsy/ })
    expect(link.getAttribute('href')).toBe(
      'https://www.etsy.com/shop/SteadyPlanner?ref=steady-demo',
    )
    expect(screen.queryByText('The app')).toBeNull()
  })

  it('sample data seeds the household and opens the app', async () => {
    window.history.replaceState(null, '', '/setup')
    renderGate()
    await userEvent.click(
      await screen.findByRole('button', { name: /Look around with sample data/ }),
    )
    expect(await screen.findByText('The app')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
    expect(await db.transactions.count()).toBeGreaterThan(20)
    expect((await getDemoState())?.kind).toBe('sample')
  })

  it('own numbers starts an empty demo and goes to setup', async () => {
    renderGate()
    await userEvent.click(await screen.findByRole('button', { name: /Try with my own numbers/ }))
    expect(await screen.findByText('The app')).toBeTruthy()
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/setup'))
    expect(await db.transactions.count()).toBe(0)
    expect(await getDemoState()).toMatchObject({ kind: 'own', entries: 0 })
  })

  it('a week later it starts over at the two ways in', async () => {
    await seedDemo(new Date(NOW.getTime() - 8 * 86_400_000))
    renderGate()
    expect(await screen.findByRole('heading', { name: 'Try Steady' })).toBeTruthy()
    expect(await db.transactions.count()).toBe(0)
  })

  it('shows the calm limit sheet when the cap is reached, and saves nothing more', async () => {
    await seedDemo(NOW)
    await db.meta.put({
      key: 'demo',
      value: { startedAt: NOW.toISOString(), kind: 'sample', entries: DEMO_CAP },
    })
    renderGate()
    await screen.findByText('The app')
    const before = await db.transactions.count()
    await expect(
      r.addTransaction({ date: '2026-10-31', amount: -300, note: 'Coffee' }),
    ).rejects.toThrow()
    const sheet = await screen.findByRole('dialog', {
      name: 'Demo limit reached — the full app has no limits',
    })
    expect(within(sheet).getByRole('link', { name: /Get the full app on Etsy/ })).toBeTruthy()
    expect(within(sheet).getByRole('link', { name: 'Bring my setup across' })).toBeTruthy()
    expect(await db.transactions.count()).toBe(before)
  })
})

describe('sample data in the app', () => {
  it('fills Today, the Calendar, Savings, Debt and Goals', async () => {
    await seedDemo(NOW)
    await seedReadyInstall()
    render(<App />)
    // Today: greeted by name, with this month's safe to spend as a real number.
    expect(await screen.findByRole('heading', { level: 1, name: /, Sam$/ })).toBeTruthy()
    const tiles = within(await screen.findByRole('list', { name: 'At a glance' }))
    const safe = tiles.getByText(/safe to spend$/).closest('li')!
    expect(safe.querySelector('p:last-child')!.textContent).toMatch(/\d/)

    await userEvent.click(screen.getAllByRole('link', { name: 'Calendar' })[0]!)
    expect(await screen.findAllByText('Rent')).not.toHaveLength(0)
    expect(screen.getAllByText('Phone').length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('link', { name: 'Savings' })[0]!)
    expect(await screen.findByText('52-week challenge')).toBeTruthy()

    await userEvent.click(screen.getAllByRole('link', { name: 'Debt' })[0]!)
    expect((await screen.findAllByText('Credit card')).length).toBeGreaterThan(0)

    await userEvent.click(screen.getAllByRole('link', { name: 'Goals' })[0]!)
    expect(await screen.findByText('Two weeks by the sea')).toBeTruthy()
    expect(screen.getByText('Still want it?')).toBeTruthy()
  })
})

describe('etsyUrl', () => {
  it('keeps the listing and adds a ref; a broken value falls back to the shop', () => {
    expect(etsyUrl('https://www.etsy.com/listing/123?x=1')).toBe(
      'https://www.etsy.com/listing/123?x=1&ref=steady-demo',
    )
    expect(etsyUrl('not a url')).toBe('https://www.etsy.com/shop/SteadyPlanner?ref=steady-demo')
    expect(etsyUrl(undefined)).toContain('SteadyPlanner')
  })
})
