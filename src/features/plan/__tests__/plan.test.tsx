// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// Wed 4 Nov 2026, planning by month. Tracking starts today with €842.50 (the check-in),
// and the €2,100 salary on Mon 30 Nov counts as November's money in.
const NOW = new Date(2026, 10, 4, 12, 0)
const EARLIER = new Date(2026, 10, 4, 8, 0).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false, envelopesEnabled: true })
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

/** Food (€100 budget, €25 spent) and Fun (€50 budget, €75 spent), both today. */
async function seedEnvelopes() {
  const food = await r.addEnvelope({ name: 'Food', budget: 10000, color: 'sage' })
  const fun = await r.addEnvelope({ name: 'Fun', budget: 5000, color: 'plum' })
  await r.addTransaction({ date: '2026-11-04', amount: -2500, note: 'shop', envelopeId: food.id })
  await r.addTransaction({ date: '2026-11-04', amount: -7500, note: 'gig', envelopeId: fun.id })
}

describe('Home', () => {
  it('/plan now opens Home', async () => {
    goto('/plan')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeTruthy()
    expect(window.location.pathname).toBe('/home')
  })

  it('the month picker steps back to October and returns to this month', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const nav = await screen.findByRole('navigation', { name: 'Months' })
    expect(within(nav).getByText('November 2026')).toBeTruthy()
    // Already on this month: no way "back" to offer.
    expect(within(nav).queryByRole('button', { name: 'This month' })).toBeNull()

    await userEvent.click(within(nav).getByRole('button', { name: 'Previous month' }))
    expect(await within(nav).findByText('October 2026')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Budget vs actuals — October' })).toBeTruthy()
    // October is before tracking started and has no spending in it.
    const dist = screen.getByRole('region', { name: 'Spending distribution' })
    expect(within(dist).getByText('Nothing spent yet.')).toBeTruthy()

    await userEvent.click(within(nav).getByRole('button', { name: 'This month' }))
    expect(await within(nav).findByText('November 2026')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Budget vs actuals — November' })).toBeTruthy()
    expect(within(nav).queryByRole('button', { name: 'This month' })).toBeNull()
  })

  it('income vs spending: money in against bills and spending', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Income vs spending' })
    expect(within(card).getByText('€2,100.00')).toBeTruthy()
    expect(within(card).getByText('€100.00')).toBeTruthy()
    expect(
      within(card)
        .getByText(/€2,000\.00/)
        .closest('p')?.textContent,
    ).toBe('€2,000.00 more came in than went out.Starting balance: €842.50, counted on its own.')
  })

  it('budget vs actuals shows each envelope’s planned and actual', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Budget vs actuals, November 2026' })
    expect(within(list).getByText('Food: planned €100.00, actual €25.00.')).toBeTruthy()
    expect(within(list).getByText('€100.00 / €25.00')).toBeTruthy()
    // Over budget is said in words.
    expect(
      within(list).getByText('Fun: planned €50.00, actual €75.00, over by €25.00.'),
    ).toBeTruthy()
    expect(within(list).getByText('€25.00 over plan')).toBeTruthy()
  })

  it('spending distribution lists envelopes in order with their share', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Spending distribution' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Food€25.00 · 25%', 'Fun€75.00 · 75%'])
  })

  it('left to spend shows the safe-to-spend amount, and the math without a per-day line', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Left to spend' })
    // €842.50 + €2,100 − €100 spent.
    expect(within(card).getByText('€2,842.50')).toBeTruthy()
    expect(within(card).getByText('safe to spend')).toBeTruthy()
    expect(within(card).getByRole('img').getAttribute('aria-label')).toBe(
      'Envelopes €100.00, Debt €0.00, Savings €0.00, Safe to spend €2,842.50',
    )

    await userEvent.click(within(card).getByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    expect(within(sheet).getByText('€2,842.50')).toBeTruthy()
    expect(within(sheet).queryByText(/a day$/)).toBeNull()
  })

  it('has this month’s note', async () => {
    goto('/home')
    render(<App />)
    const note = await screen.findByRole('region', { name: 'Note for this month' })
    expect(await within(note).findByRole('button', { name: 'Add a note' })).toBeTruthy()
  })

  it('without envelopes there is no budget chart, but the rest is there', async () => {
    await r.updateSettings({ envelopesEnabled: false })
    await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'lunch' })
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Spending distribution' })
    expect(within(list).getByText('Spending')).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Budget vs actuals/ })).toBeNull(),
    )
    expect(screen.getByRole('region', { name: 'Left to spend' })).toBeTruthy()
  })
})
