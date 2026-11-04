// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, seedReadyInstall } from '../../db/__tests__/helpers'
import { updateSettings } from '../../db/repos'
import { App } from '../App'

// The whole app as a user meets it: real router, real settings row in (fake) IndexedDB.
async function renderAt(path: string) {
  window.history.replaceState(null, '', path)
  render(<App />)
  return screen.findByRole('navigation', { name: 'Main' })
}

const tabNames = () =>
  screen
    .getAllByRole('link')
    .filter((a) => a.closest('nav'))
    .map((a) => a.textContent)

beforeEach(async () => {
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(cleanup)

describe('tabs in Simple and Full mode (PLAN §5)', () => {
  it('new installs show every section, in the order the planner is used', async () => {
    await renderAt('/')
    await waitFor(() =>
      expect(tabNames()).toEqual([
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
      ]),
    )
  })

  it('Simple mode keeps setup, Today, Calendar, Settings and More', async () => {
    await updateSettings({ simpleMode: true })
    await renderAt('/')
    await waitFor(() =>
      expect(tabNames()).toEqual(['Getting started', 'Today', 'Calendar', 'Settings', 'More']),
    )
  })

  it('Full mode adds Home, Goals, Savings, Debt, Envelopes and Yearly review', async () => {
    await updateSettings({ simpleMode: false })
    await renderAt('/')
    await waitFor(() =>
      expect(tabNames()).toEqual([
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
      ]),
    )
  })

  it.each([
    ['/', 'Today'],
    ['/bills', 'Calendar'],
    ['/more', 'More'],
    ['/more/settings', 'Settings'],
    ['/more/backup', 'More'],
    ['/home', 'Home'],
    ['/envelopes', 'Envelopes'],
    ['/getting-started', 'Getting started'],
  ])('%s marks the %s tab with aria-current="page"', async (path, tab) => {
    await renderAt(path)
    await waitFor(() => {
      const current = screen.getAllByRole('link').filter((a) => a.closest('nav'))
      expect(
        current.filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent),
      ).toEqual([tab])
    })
  })

  it.each(['/plan', '/goals'])('%s redirects to Today in Simple mode', async (path) => {
    await updateSettings({ simpleMode: true })
    await renderAt(path)
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it.each(['/home', '/goals', '/envelopes', '/savings', '/debt', '/review'])(
    '%s opens directly in Full mode',
    async (path) => {
      await updateSettings({ simpleMode: false })
      await renderAt(path)
      await waitFor(() => expect(tabNames()).toContain('Goals'))
      expect(window.location.pathname).toBe(path)
    },
  )

  it('switching back to Simple while on Goals leaves the hidden screen', async () => {
    await updateSettings({ simpleMode: false })
    await renderAt('/goals')
    await waitFor(() => expect(tabNames()).toContain('Goals'))
    await act(() => updateSettings({ simpleMode: true }))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(tabNames()).toEqual(['Getting started', 'Today', 'Calendar', 'Settings', 'More'])
  })

  it('/plan, /more/debts and /more/review go to their new sections', async () => {
    await updateSettings({ simpleMode: false })
    for (const [from, to] of [
      ['/plan', '/home'],
      ['/more/debts', '/debt'],
      ['/more/review', '/review'],
    ] as const) {
      cleanup()
      await renderAt(from)
      await waitFor(() => expect(window.location.pathname).toBe(to))
    }
  })

  it('the More toggle turns on Simple mode and it persists', async () => {
    await renderAt('/more')
    await userEvent.click(await screen.findByRole('switch', { name: 'Show more tools' }))
    await waitFor(() => expect(tabNames()).not.toContain('Home'))
    cleanup()
    await renderAt('/')
    await waitFor(() =>
      expect(tabNames()).toEqual(['Getting started', 'Today', 'Calendar', 'Settings', 'More']),
    )
  })

  it('unknown paths fall back to Today', async () => {
    await renderAt('/nope/really')
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })

  it('/start sends a browser without install support to the install guide', async () => {
    await renderAt('/start')
    await waitFor(() => expect(window.location.pathname).toBe('/more/install'))
  })
})

describe('settings persist', () => {
  it('a theme picked in Settings survives a fresh mount and lands on <html>', async () => {
    await renderAt('/more/settings')
    await userEvent.click(await screen.findByRole('radio', { name: 'Ocean' }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('ocean'))
    cleanup()
    delete document.documentElement.dataset.theme
    await renderAt('/more/settings')
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Ocean' }).getAttribute('aria-checked')).toBe(
        'true',
      ),
    )
    expect(document.documentElement.dataset.theme).toBe('ocean')
  })

  it('arrow keys move through themes like native radios', async () => {
    await renderAt('/more/settings')
    const clay = await screen.findByRole('radio', { name: 'Clay' })
    await waitFor(() => expect(clay.getAttribute('aria-checked')).toBe('true'))
    clay.focus()
    await userEvent.keyboard('{ArrowRight}')
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('sage'))
    expect(document.activeElement?.getAttribute('data-theme')).toBe('sage')
  })

  it('text-size options have spoken names, not four "A"s', async () => {
    await renderAt('/more/settings')
    const group = await screen.findByRole('radiogroup', { name: 'Text size' })
    const names = [...group.querySelectorAll('[role=radio]')].map((r) =>
      r.getAttribute('aria-label'),
    )
    expect(new Set(names).size).toBe(4)
    expect(names.every(Boolean)).toBe(true)
  })
})

// axe-core on the rendered DOM (PLAN §10 M3 "axe passes"). happy-dom has no layout, so
// colour contrast is checked by contrast.test.ts instead.
describe('axe', () => {
  it.each([
    '/',
    '/bills',
    '/plan',
    '/goals',
    '/more',
    '/more/help',
    '/more/settings',
    '/more/backup',
    '/more/install',
  ])('%s has no violations', async (path) => {
    await updateSettings({ simpleMode: false })
    await renderAt(path)
    await screen.findByRole('heading', { level: 1 })
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})
