// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// Wed 4 Nov 2026, planning by month: 27 days left. Tracking starts today with €842.50
// (the check-in), and the €2,100 salary on Mon 30 Nov counts as November's money in.
const NOW = new Date(2026, 10, 4, 12, 0)
const EARLIER = new Date(2026, 10, 4, 8, 0).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false })
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
  await r.addCheckIn(84250, '2026-11-04', EARLIER)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const goto = (path: string) => window.history.replaceState(null, '', path)
const hero = async () =>
  (await screen.findByRole('region', { name: 'Today’s number' })).querySelector('[aria-live]')!

describe('Plan', () => {
  it('shows the month: starting balance, the pay, and what is safe to spend', async () => {
    goto('/plan')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'November 2026' })
    expect(within(card).getByText('Starting balance')).toBeTruthy()
    expect(within(card).getByText(/Salary · Mon,? 30 Nov/)).toBeTruthy()
    expect(within(card).getAllByText('€2,100.00').length).toBeGreaterThan(0)
    expect(within(card).getByText('€2,942.50')).toBeTruthy()
  })

  it('steps back a month; before tracking started it shows actuals only', async () => {
    goto('/plan')
    render(<App />)
    await screen.findByRole('region', { name: 'November 2026' })
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    const card = await screen.findByRole('region', { name: 'October 2026' })
    expect(within(card).getByText(/Before you started tracking/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'This month' }))
    expect(await screen.findByRole('region', { name: 'November 2026' })).toBeTruthy()
  })

  it('the strip shows money in, bills, spent and safe to spend', async () => {
    goto('/plan')
    render(<App />)
    const strip = await screen.findByRole('region', { name: 'This period at a glance' })
    expect(within(strip).getByText('Money in')).toBeTruthy()
    expect(within(strip).getByText('Bills')).toBeTruthy()
    expect(within(strip).getByText('Spent')).toBeTruthy()
    expect(within(strip).getByText('Safe to spend')).toBeTruthy()
    expect(within(strip).getAllByText('€2,942.50')).toHaveLength(2)
  })

  it('savings: totals, and the per-payday pace for a fund with a date', async () => {
    await r.addFund({
      name: 'Holiday',
      target: 60000,
      targetDate: '2027-01-31',
      perPeriod: 0,
      openingSaved: 0,
    })
    goto('/plan')
    render(<App />)
    const tiles = await screen.findByRole('region', { name: 'Savings totals' })
    expect(within(tiles).getByText('€600.00')).toBeTruthy()
    expect(within(tiles).getByText('0%')).toBeTruthy()
    // Paydays left by 31 Jan: 30 Nov, 31 Dec, 29 Jan -> €200 each.
    expect(screen.getByText(/About €200\.00 per payday to reach it by/)).toBeTruthy()
  })

  it('envelopes are on by default; add one with a monthly budget and reorder', async () => {
    await r.ensureDefaultEnvelope()
    goto('/plan')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Everyday' })).toBeTruthy()
    expect((await r.getSettings()).envelopesEnabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Add envelope' }))
    const sheet = await screen.findByRole('dialog', { name: 'New envelope' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Food')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Budget each month' }), '300')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add envelope' }))
    expect(await screen.findByText('€300.00 left of €300.00')).toBeTruthy()

    // Reorder: Food moves above Everyday.
    await userEvent.click(screen.getByRole('button', { name: 'Move Food up' }))
    await waitFor(async () =>
      expect((await r.listEnvelopes()).map((e) => e.name)).toEqual(['Food', 'Everyday']),
    )
  })

  it('going over an envelope reads as calm text, and the bar stays full, not red', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    const food = await r.addEnvelope({ name: 'Food', budget: 10000, color: 'accent' })
    await r.addTransaction({
      date: '2026-11-04',
      amount: -12500,
      note: 'shop',
      envelopeId: food.id,
    })
    goto('/plan')
    render(<App />)
    expect(await screen.findByText(/€25\.00 over the plan/)).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: 'Food used' }).getAttribute('aria-valuenow'),
    ).toBe('100')
  })

  it('deletes an envelope with undo', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    await r.addEnvelope({ name: 'Fun', budget: 5000, color: 'accent' })
    goto('/plan')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Fun' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Fun' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete envelope' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Fun' })).toBeNull())
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('heading', { name: 'Fun' })).toBeTruthy()
  })

  it('"Can this fit?" says how a price sits in an envelope’s budget', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    await r.addEnvelope({ name: 'Food', budget: 10000, color: 'accent' })
    goto('/plan')
    render(<App />)
    const fit = await screen.findByRole('region', { name: 'Can this fit?' })
    await userEvent.type(within(fit).getByRole('textbox', { name: 'Price' }), '40')
    await userEvent.click(within(fit).getByRole('button', { name: /Food · €100\.00 left/ }))
    expect(
      await within(fit).findByText(/Inside your Food budget \(€60\.00 left after\)/),
    ).toBeTruthy()
    // Envelopes without a budget (Everyday here) hold no room, so they are not offered.
    expect(within(fit).queryByRole('button', { name: /Everyday/ })).toBeNull()
  })
})

describe('Today with envelopes on', () => {
  it('budgets hold nothing back; spending lowers today’s number by exactly the spend', async () => {
    await r.updateSettings({ envelopesEnabled: true, simpleMode: true })
    await r.ensureDefaultEnvelope()
    await r.addEnvelope({ name: 'Food', budget: 26000, color: 'accent' })
    goto('/')
    render(<App />)
    // (84250 + 210000) / 27 = 10898.1 -> €108.98, Food's budget or not.
    expect((await hero()).textContent).toBe('€108.98')
    const field = screen.getByRole('textbox', { name: /Quick add/ })
    await userEvent.type(field, '12 lunch @food{Enter}')
    await waitFor(async () => expect((await hero()).textContent).toBe('€96.98'))
  })
})

describe('Simple mode keeps envelopes out of sight', () => {
  it('Today’s "Can this fit?" offers no envelope picker in Simple mode', async () => {
    await r.updateSettings({ envelopesEnabled: true, simpleMode: true })
    await r.ensureDefaultEnvelope()
    await r.addEnvelope({ name: 'Food', budget: 10000, color: 'accent' })
    goto('/')
    render(<App />)
    await hero()
    await userEvent.click(screen.getByRole('button', { name: 'Can this fit?' }))
    const fit = await screen.findByRole('dialog', { name: 'Can this fit?' })
    await userEvent.type(within(fit).getByRole('textbox', { name: 'Price' }), '40')
    expect(within(fit).queryByText('From an envelope?')).toBeNull()
    expect(within(fit).queryByRole('button', { name: /Food/ })).toBeNull()
  })
})

describe('Just today', () => {
  it('shows only the number and one card', async () => {
    goto('/')
    render(<App />)
    await hero()
    expect(screen.getByRole('textbox', { name: /Quick add/ })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Just today' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /Quick add/ })).toBeNull())
    expect(screen.queryByRole('button', { name: 'See the math' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Can this fit?' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Just today' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await hero()).toBeTruthy()
  })

  it('tapping an envelope lists its entries this period, with a link to the log', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    const everyday = await r.ensureDefaultEnvelope()
    const food = await r.addEnvelope({ name: 'Food', budget: 10000, color: 'sage' })
    await r.addTransaction({
      date: '2026-11-02',
      amount: -1500,
      note: 'market',
      envelopeId: food.id,
    })
    await r.addTransaction({ date: '2026-11-03', amount: -2500, note: 'shop', envelopeId: food.id })
    await r.addTransaction({ date: '2026-11-03', amount: -900, note: 'coffee' })
    // Before this month: not listed.
    await r.addTransaction({ date: '2026-10-20', amount: -4000, note: 'old', envelopeId: food.id })
    goto('/plan')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Food' }))
    const sheet = await screen.findByRole('dialog', { name: 'Food' })
    const list = within(sheet).getByRole('list', { name: 'Food entries' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringMatching(/shop.*€25\.00/), expect.stringMatching(/market.*€15\.00/)])
    expect(within(sheet).getByText('€40.00')).toBeTruthy()
    expect(within(sheet).getByText(/€60\.00 left/)).toBeTruthy()
    await userEvent.click(within(sheet).getByRole('link', { name: 'See all in log' }))
    // The log opens filtered to Food.
    const chips = await screen.findByRole('group', { name: /Envelope/ })
    expect(within(chips).getByRole('button', { name: /Food/ }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(await screen.findByText('market')).toBeTruthy()
    expect(screen.queryByText('coffee')).toBeNull()
    expect(everyday.isDefault).toBe(true)
  })
})
