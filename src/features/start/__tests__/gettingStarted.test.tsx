// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { TABS } from '../../../app/tabs'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { SECTION_GUIDE } from '../sections'

// Wed 4 Nov 2026, noon local.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  window.history.replaceState(null, '', '/getting-started')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const balanceField = () => screen.findByRole('textbox', { name: 'Starting balance' })

describe('Getting started: the numbers everything is built on', () => {
  it('has the title, then currency, starting balance and roll over, in that order', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Getting started' })).toBeTruthy()
    await balanceField()
    const cards = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(cards).toEqual([
      'Your currency',
      'Starting balance',
      'Roll over leftover money',
      'How each section works',
    ])
  })

  it('lists every supported currency by name, and a change sets its decimals too', async () => {
    render(<App />)
    const select = await screen.findByRole('combobox', { name: 'Your currency' })
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(labels).toContain('US Dollar — USD')
    expect(labels).toContain('Japanese Yen — JPY')
    expect(labels).toContain('Euro — EUR')
    expect((select as HTMLSelectElement).value).toBe('EUR')
    // Nothing is saved yet, so nothing limits the choice.
    expect(screen.queryByText(/same decimals/)).toBeNull()

    await userEvent.selectOptions(select, 'USD')
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({ currency: 'USD', decimals: 2 }),
    )
    await userEvent.selectOptions(select, 'JPY')
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({ currency: 'JPY', decimals: 0 }),
    )
    // The amount field follows: no decimals for yen.
    expect((await balanceField()).getAttribute('placeholder')).toBe('0')
  })

  it('once an amount is saved, only offers currencies that keep its value', async () => {
    await r.addFund({ name: 'Cushion', perPeriod: 0, openingSaved: 12000, target: 40000 })
    render(<App />)
    const select = await screen.findByRole('combobox', { name: 'Your currency' })
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(labels).toContain('US Dollar — USD')
    expect(labels).toContain('Euro — EUR')
    // Yen has no decimals: 12000 would read ¥12,000 instead of €120.00.
    expect(labels).not.toContain('Japanese Yen — JPY')
    expect(labels.length).toBeGreaterThan(1)
    const hint = screen.getByText(/same decimals/)
    expect(select.getAttribute('aria-describedby')).toContain(hint.id)

    await userEvent.selectOptions(select, 'USD')
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({ currency: 'USD', decimals: 2 }),
    )
  })

  it('a starting balance counts as a saved amount too', async () => {
    await r.updateSettings({ startDate: '2026-11-01', startingBalance: 10000 })
    render(<App />)
    const select = await screen.findByRole('combobox', { name: 'Your currency' })
    const labels = [...select.querySelectorAll('option')].map((o) => o.textContent)
    expect(labels).not.toContain('Japanese Yen — JPY')
  })

  it('saves the starting balance when the field is left, starting this month if unset', async () => {
    render(<App />)
    const field = await balanceField()
    expect((field as HTMLInputElement).placeholder).toBe('0.00')
    await userEvent.type(field, '1250.50')
    // Nothing is written while typing.
    expect((await r.getSettings()).startDate).toBeNull()
    await userEvent.tab()
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({
        startingBalance: 125050,
        startDate: '2026-11-01',
      }),
    )
    expect(await screen.findByText('Starting balance saved')).toBeTruthy()
  })

  it('Undo on the saved toast puts the balance back and leaves other changes alone', async () => {
    await r.updateSettings({ startDate: '2026-10-15', startingBalance: 40000 })
    // An unrelated, earlier change that is still in the undo log.
    await r.addTransaction({ date: '2026-11-03', amount: -1777, note: 'Earlier spend' })
    const before = (await r.listTransactions()).length
    render(<App />)
    const field = (await balanceField()) as HTMLInputElement
    await userEvent.clear(field)
    await userEvent.type(field, '4321{Enter}')
    await waitFor(async () => expect((await r.getSettings()).startingBalance).toBe(432100))

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({
        startingBalance: 40000,
        startDate: '2026-10-15',
      }),
    )
    await waitFor(() => expect(field.value).toBe('400.00'))
    expect(await r.listTransactions()).toHaveLength(before)
  })

  it('Undo of a first starting balance clears it again', async () => {
    render(<App />)
    const field = (await balanceField()) as HTMLInputElement
    await userEvent.type(field, '250{Enter}')
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({
        startingBalance: 25000,
        startDate: '2026-11-01',
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({ startingBalance: 0, startDate: null }),
    )
    await waitFor(() => expect(field.value).toBe(''))
  })

  it('Enter saves too, and keeps a start date that is already set', async () => {
    await r.updateSettings({ startDate: '2026-10-15', startingBalance: 40000 })
    render(<App />)
    const field = await balanceField()
    expect((field as HTMLInputElement).value).toBe('400.00')
    await userEvent.clear(field)
    await userEvent.type(field, '520{Enter}')
    await waitFor(async () =>
      expect(await r.getSettings()).toMatchObject({
        startingBalance: 52000,
        startDate: '2026-10-15',
      }),
    )
    // Leaving the field afterwards doesn't save (or announce) it a second time.
    await userEvent.tab()
    expect(screen.getAllByText('Starting balance saved')).toHaveLength(1)
  })

  it('asks for a real amount instead of saving one it cannot read', async () => {
    render(<App />)
    const field = await balanceField()
    await userEvent.type(field, '12.345')
    await userEvent.tab()
    expect(await screen.findByText('Enter an amount like 250.00')).toBeTruthy()
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(await r.getSettings()).toMatchObject({ startingBalance: 0, startDate: null })
  })

  it('leaving the field untouched writes nothing', async () => {
    render(<App />)
    const field = await balanceField()
    field.focus()
    await userEvent.tab()
    expect(await r.getSettings()).toMatchObject({ startingBalance: 0, startDate: null })
    expect(screen.queryByText('Starting balance saved')).toBeNull()
  })

  it('a change made elsewhere shows in the field', async () => {
    await r.updateSettings({ startDate: '2026-11-01', startingBalance: 10000 })
    render(<App />)
    const field = (await balanceField()) as HTMLInputElement
    expect(field.value).toBe('100.00')
    await r.updateSettings({ startingBalance: 25000 })
    await waitFor(() => expect(field.value).toBe('250.00'))
  })

  it('the roll over switch turns carrying leftovers on and off', async () => {
    render(<App />)
    const toggle = await screen.findByRole('switch', { name: 'Roll over leftover money' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    await userEvent.click(toggle)
    await waitFor(async () => expect((await r.getSettings()).rollover).toBe(true))
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    await userEvent.click(toggle)
    await waitFor(async () => expect((await r.getSettings()).rollover).toBe(false))
  })

  it('speaks of pay periods when planning payday to payday', async () => {
    await r.updateSettings({ planBy: 'payday' })
    render(<App />)
    expect(await screen.findByText(/carries into the next one/)).toBeTruthy()
    expect(screen.getByText(/when a pay period ends/)).toBeTruthy()
  })
})

describe('Getting started: how each section works', () => {
  const ORDER = [
    'Home',
    'Today',
    'Calendar',
    'Goals',
    'Savings',
    'Debt',
    'Envelopes',
    'Yearly review',
    'Settings',
  ]

  it('names every section in the menu’s order, each with a line on what it does', async () => {
    render(<App />)
    const guide = await screen.findByRole('region', { name: 'How each section works' })
    const items = within(guide).getAllByRole('listitem')
    expect(items.map((li) => within(li).getByRole('heading', { level: 3 }).textContent)).toEqual(
      ORDER,
    )
    for (const li of items) expect(li.querySelector('p')?.textContent?.length).toBeGreaterThan(40)
  })

  it('follows the navigation itself, so the two can never disagree', () => {
    const navOrder = TABS.map((t) => t.label).filter((l) => ORDER.includes(l))
    expect(SECTION_GUIDE.map((s) => s.label)).toEqual(navOrder)
  })

  it('in Simple mode only describes the sections that are there', async () => {
    await r.updateSettings({ simpleMode: true })
    render(<App />)
    const guide = await screen.findByRole('region', { name: 'How each section works' })
    expect(
      within(guide)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Today', 'Calendar', 'Settings'])
  })

  it('ends with the guide: nothing follows it in the page', async () => {
    render(<App />)
    const guide = await screen.findByRole('region', { name: 'How each section works' })
    expect(guide.nextElementSibling).toBeNull()
    expect(screen.queryByRole('link', { name: /money settings/i })).toBeNull()
  })
})

describe('Settings and Money basics point at each other', () => {
  it('Settings has Money and Backups groups, and Money basics goes back to Settings', async () => {
    window.history.replaceState(null, '', '/more/settings')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: /Getting started/ }).getAttribute('href')).toBe(
      '/getting-started',
    )
    expect(main.getByRole('link', { name: /Backup, restore & erase/ }).getAttribute('href')).toBe(
      '/more/backup',
    )
    const groups = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(groups.indexOf('Money')).toBeLessThan(groups.indexOf('Theme'))
    expect(groups.indexOf('Backups')).toBeGreaterThan(groups.indexOf('Tools'))

    await userEvent.click(main.getByRole('link', { name: /Money basics/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Money basics' })).toBeTruthy()
    await userEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
  })
})

// axe-core on the rendered DOM; happy-dom has no layout, so contrast is checked elsewhere.
describe('axe', () => {
  it.each(['/getting-started', '/savings', '/debt', '/review', '/goals', '/more'])(
    '%s has no violations',
    async (path) => {
      await r.updateSettings({ simpleMode: false })
      await r.addFund({ name: 'Cushion', perPeriod: 0, openingSaved: 12000, target: 40000 })
      window.history.replaceState(null, '', path)
      render(<App />)
      await screen.findByRole('heading', { level: 1 })
      // Let the live queries settle so the cards, not their loading shapes, are checked.
      await new Promise((resolve) => setTimeout(resolve, 300))
      const result = await axe.run(document.body, {
        rules: {
          'color-contrast': { enabled: false },
          // Savings hides FundsSection's own totals strip with CSS (display: none, so it
          // leaves the accessibility tree in a browser); happy-dom applies no stylesheet,
          // so here the two strips look like two landmarks with one name.
          'landmark-unique': { enabled: path !== '/savings' },
        },
      })
      expect(result.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
    },
  )
})
