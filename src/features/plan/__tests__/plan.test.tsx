// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// Wed 4 Nov 2026. Salary on the last day (Mon 30 Nov), so 26 days to payday.
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
  it('first period: shows the expected pay, not a payday from before the first balance', async () => {
    goto('/plan')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'This period' })
    // Fri 30 Oct started this period, but the first balance is from 4 Nov: that pay is
    // already in it and was never entered here, so the line shows the next pay instead.
    expect(await within(card).findByText(/Expected pay · Mon,? 30 Nov/)).toBeTruthy()
    expect(within(card).queryByText(/Salary · Fri,? 30 Oct/)).toBeNull()
    expect(within(card).getAllByText('€2,100.00').length).toBeGreaterThan(0)
    expect(within(card).getAllByText('€842.50').length).toBe(2) // balance, safe to spend
  })

  it('a later period lists the payday that started it', async () => {
    await r.addCheckIn(50000, '2026-10-01', new Date(2026, 9, 1, 8).toISOString())
    goto('/plan')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'This period' })
    // Fri 30 Oct (31 Oct is a Saturday) started this period.
    expect(await within(card).findByText(/Salary · Fri,? 30 Oct/)).toBeTruthy()
    expect(within(card).getByText('Income this period')).toBeTruthy()
  })

  it('the strip shows income, set aside and safe to spend', async () => {
    goto('/plan')
    render(<App />)
    const strip = await screen.findByRole('region', { name: 'This period at a glance' })
    expect(within(strip).getByText('Expected pay')).toBeTruthy()
    expect(within(strip).getByText('€2,100.00')).toBeTruthy()
    expect(within(strip).getByText('Set aside')).toBeTruthy()
    expect(within(strip).getByText('Safe to spend')).toBeTruthy()
    expect(within(strip).getByText('€842.50')).toBeTruthy()
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

  it('envelopes are off by default, explained, and turn on with Everyday', async () => {
    goto('/plan')
    render(<App />)
    expect(await screen.findByText(/Envelopes give parts of your money a job/)).toBeTruthy()
    await userEvent.click(screen.getByRole('switch', { name: 'Use envelopes' }))
    expect(await screen.findByRole('heading', { name: 'Everyday' })).toBeTruthy()
    expect((await r.getSettings()).envelopesEnabled).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: 'Add envelope' }))
    const sheet = await screen.findByRole('dialog', { name: 'New envelope' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Food')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Budget each payday' }), '300')
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
    expect(await screen.findByText(/Over by €25\.00/)).toBeTruthy()
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

  it('"Can this fit?" counts an envelope’s room first', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    await r.addEnvelope({ name: 'Food', budget: 10000, color: 'accent' })
    goto('/plan')
    render(<App />)
    const fit = await screen.findByRole('region', { name: 'Can this fit?' })
    await userEvent.type(within(fit).getByRole('textbox', { name: 'Price' }), '40')
    await userEvent.click(within(fit).getByRole('button', { name: /Food · €100\.00 left/ }))
    expect(await within(fit).findByText(/fits inside Food/)).toBeTruthy()
    // Envelopes without a budget (Everyday here) hold no room, so they are not offered.
    expect(within(fit).queryByRole('button', { name: /Everyday/ })).toBeNull()
  })
})

describe('Today with envelopes on (open issue)', () => {
  it('spending inside an envelope still lowers today’s number by exactly the spend', async () => {
    await r.updateSettings({ envelopesEnabled: true, simpleMode: true })
    await r.ensureDefaultEnvelope()
    await r.addEnvelope({ name: 'Food', budget: 26000, color: 'accent' })
    goto('/')
    render(<App />)
    // (84250 − 26000) / 26 = 2240.38 -> €22.40
    expect((await hero()).textContent).toBe('€22.40')
    const field = screen.getByRole('textbox', { name: /Quick add/ })
    await userEvent.type(field, '12 lunch @food{Enter}')
    await waitFor(async () => expect((await hero()).textContent).toBe('€10.40'))
    expect(screen.getByText('€582.50')).toBeTruthy() // until payday: unchanged
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
})
