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

  it('never says a plan "saves €0.00": equal plans are named as the same cost', async () => {
    await r.updateSettings({ simpleMode: false })
    await r.addDebt(card)
    window.history.replaceState(null, '', '/goals')
    render(<App />)
    expect(await screen.findByText(/Both plans cost the same here/)).toBeTruthy()
    expect(screen.queryByText(/saves .*0\.00/)).toBeNull()
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

    expect(screen.getByText(/^Not financial advice\./)).toBeTruthy()

    // Avalanche (default) focuses the 24% loan first; snowball the smaller card.
    const order = screen.getByRole('list', { name: 'Payoff order' })
    const focused = () =>
      within(order)
        .getAllByRole('listitem')
        .filter((li) => li.textContent?.includes('Focus first'))
        .map((li) => li.textContent)
    expect(focused()).toEqual([expect.stringMatching(/Car loan/)])
    await userEvent.click(screen.getByRole('radio', { name: 'Snowball' }))
    expect(focused()).toEqual([expect.stringMatching(/Visa/)])

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

  it('"Focus first" marks where the extra goes, even when another debt finishes first', async () => {
    await r.updateSettings({ simpleMode: false })
    // The 0% card clears on its own minimum in month 1; the extra goes to the loan.
    await r.addDebt({ ...card, name: 'Store card', balance: 10000, aprBps: 0, minPayment: 10000 })
    await r.addDebt({ ...loan, balance: 100000, aprBps: 2000, minPayment: 2000 })
    window.history.replaceState(null, '', '/goals')
    render(<App />)
    const order = await screen.findByRole('list', { name: 'Payoff order' })
    const items = within(order).getAllByRole('listitem')
    expect(items[0]!.textContent).toMatch(/Store card/)
    expect(items[0]!.textContent).not.toMatch(/Focus first/)
    expect(items[1]!.textContent).toMatch(/Car loan.*Focus first/)
  })

  it('a budget that never finishes says so instead of showing a 50-year total', async () => {
    await r.addDebt({ ...loan, name: 'Store card', balance: 100000, minPayment: 1500 })
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    const budget = await screen.findByRole('textbox', { name: 'Each month toward debts' })
    await userEvent.clear(budget)
    await userEvent.type(budget, '15')
    expect(await screen.findByText(/no finish date within 50 years/)).toBeTruthy()
    expect(screen.getAllByText('Still adding up')).toHaveLength(2)
    expect(screen.queryByText(/Avalanche saves/)).toBeNull()
    expect(
      within(screen.getByRole('list', { name: 'Payoff order' })).getByText(/Store card/),
    ).toBeTruthy()
  })

  it('setting a balance to 0 marks it paid off and takes its minimum out of Bills', async () => {
    const { debt } = await r.addDebt(card)
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: /Visa/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Visa' })
    const balance = within(sheet).getByRole('textbox', { name: 'Balance today' })
    await userEvent.clear(balance)
    await userEvent.type(balance, '0')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect((await r.getDebt(debt.id))?.balance).toBe(0))
    expect(await screen.findByText(/Everything here is paid off/)).toBeTruthy()
    expect(screen.getByText('Paid off')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Your payoff plan' })).toBeNull()
    expect((await r.listBills()).filter((b) => b.debtId === debt.id && !b.until)).toHaveLength(0)
  })

  it('a new debt needs something owed', async () => {
    window.history.replaceState(null, '', '/more/debts')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add a debt' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add a debt' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Visa')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Balance today' }), '0')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Interest (APR)' }), '0')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Minimum payment' }), '50')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add debt' }))
    expect(await within(sheet).findByText(/Nothing owed on this one/)).toBeTruthy()
    expect(await r.listDebts()).toHaveLength(0)
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
