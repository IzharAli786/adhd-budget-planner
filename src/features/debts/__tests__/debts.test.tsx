// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

const NOW = new Date(2026, 10, 4, 12, 0) // Wed 4 Nov 2026

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

const card = {
  name: 'Visa',
  balance: 30000,
  balanceAsOf: '2026-11-04',
  aprBps: 1200,
  minPayment: 5000,
  dueDay: 20,
}
const loan = { ...card, name: 'Car loan', balance: 60000, aprBps: 2400 }

describe('Debts', () => {
  it('Simple mode: More links to Debt payoff, whose empty state names the next step', async () => {
    window.history.replaceState(null, '', '/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /Debt payoff/ }))
    expect(await screen.findByRole('heading', { name: 'No debts added' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add a debt' })).toBeTruthy()
  })

  it('adds a debt with a linked minimum bill', async () => {
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add a debt' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a debt' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Visa')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Balance today' }), '300')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Interest (APR)' }), '12.5')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Minimum payment' }), '50')
    await userEvent.selectOptions(within(sheet).getByRole('combobox', { name: 'Due day' }), '20')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add debt' }))

    await waitFor(async () => expect(await r.listDebts()).toHaveLength(1))
    const [debt] = await r.listDebts()
    expect(debt).toMatchObject({
      name: 'Visa',
      balance: 30000,
      originalBalance: 30000,
      aprBps: 1250,
      minPayment: 5000,
      dueDay: 20,
      balanceAsOf: '2026-11-04',
    })
    expect((await r.listBills())[0]).toMatchObject({ debtId: debt!.id, amount: 5000 })
    expect(await screen.findByRole('button', { name: /Visa/ })).toBeTruthy()
  })

  it('asks for the missing fields instead of saving', async () => {
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add a debt' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a debt' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add debt' }))
    expect(await within(sheet).findByText(/Give it a name/)).toBeTruthy()
    expect(within(sheet).getByText(/Use 0 if there’s none/)).toBeTruthy()
    expect(await r.listDebts()).toHaveLength(0)
  })

  it('Full mode: Goals compares snowball and avalanche with order, chart table and note', async () => {
    await r.updateSettings({ simpleMode: false })
    await r.addDebt(card)
    await r.addDebt(loan)
    window.history.replaceState(null, '', '/goals')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Debts' })).toBeTruthy()
    // Default budget = minimums (€100) + €50.
    const budget = await screen.findByRole('textbox', { name: 'Each month toward debts' })
    expect((budget as HTMLInputElement).value).toBe('150')
    expect(screen.getByRole('heading', { name: 'Snowball' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Avalanche' })).toBeTruthy()
    expect(screen.getByText(/Avalanche saves/)).toBeTruthy()
    expect(
      screen.getByText('Estimate. Real lenders may calculate interest differently.'),
    ).toBeTruthy()

    // Avalanche (default) focuses the 24% loan first; snowball the smaller card.
    const order = screen.getByRole('list', { name: 'Payoff order' })
    expect(within(order).getAllByRole('listitem')[0]!.textContent).toMatch(/Car loan.*Focus first/)
    await userEvent.click(screen.getByRole('radio', { name: 'Snowball' }))
    expect(within(order).getAllByRole('listitem')[0]!.textContent).toMatch(/Visa.*Focus first/)

    // The lazy chart arrives with its table alternative.
    const toggle = await screen.findByRole('button', { name: 'Show as a table' })
    expect(screen.getByRole('table', { name: /Total owed by month/ })).toBeTruthy()
    await userEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')

    // Below the minimums: a kind explanation instead of numbers.
    await userEvent.clear(budget)
    await userEvent.type(budget, '80')
    expect(await screen.findByText(/needs at least/)).toBeTruthy()
  })

  it('warns when a minimum does not cover the interest', async () => {
    await r.addDebt({ ...loan, name: 'Store card', balance: 100000, minPayment: 1500 })
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    expect(await screen.findByText(/minimum doesn’t cover its interest/)).toBeTruthy()
  })

  it('% paid keeps its starting point when the balance is edited', async () => {
    const { debt } = await r.addDebt(card)
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Visa/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Visa' })
    const balance = within(sheet).getByRole('textbox', { name: 'Balance today' })
    await userEvent.clear(balance)
    await userEvent.type(balance, '150')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await r.getDebt(debt.id))?.balance).toBe(15000))
    expect(await screen.findByText('50% paid')).toBeTruthy()
  })
})
