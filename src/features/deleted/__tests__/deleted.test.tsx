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

describe('Recently deleted', () => {
  it('has a friendly empty state', async () => {
    window.history.replaceState(null, '', '/more/deleted')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Nothing deleted' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to More' })).toBeTruthy()
  })

  it('restores an item, with Undo', async () => {
    const tx = await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'coffee' })
    await r.deleteTransaction(tx.id)
    window.history.replaceState(null, '', '/more/deleted')
    render(<App />)

    expect(await screen.findByText('Entry · 30 days left')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Restore coffee' }))
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(1))
    expect(await screen.findByRole('heading', { name: 'Nothing deleted' })).toBeTruthy()

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(0))
  })

  it('"Delete all for good" asks first', async () => {
    const tx = await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'coffee' })
    await r.deleteTransaction(tx.id)
    window.history.replaceState(null, '', '/more/deleted')
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete all for good' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete these for good?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    await waitFor(async () => expect(await r.listRecentlyDeleted()).toEqual([]))
    expect(await r.getTransaction(tx.id)).toBeUndefined()
  })
})

describe('Recently deleted counts', () => {
  it('counts a deleted debt once, as the list shows it', async () => {
    const { debt } = await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: '2026-11-01',
      aprBps: 1999,
      minPayment: 2500,
      dueDay: 15,
    })
    await r.deleteDebt(debt.id)
    window.history.replaceState(null, '', '/more/deleted')
    render(<App />)

    expect(await screen.findByText('Debt · 30 days left')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^Restore / })).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Delete all for good' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete these for good?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete for good' }))
    expect(await screen.findByText('1 item deleted for good.')).toBeTruthy()
    expect(await r.listBills()).toEqual([])
  })
})

describe('More > Undo last change', () => {
  it('names the change and reverts it, even after a reload', async () => {
    await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'coffee' })
    window.history.replaceState(null, '', '/more')
    render(<App />)

    const row = await screen.findByRole('button', { name: /Undo last change/ })
    expect(within(row).getByText('Add expense')).toBeTruthy()
    await userEvent.click(row)
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(0))
    expect(await screen.findByText('Undone: Add expense')).toBeTruthy()
    expect(await screen.findByText('Nothing to undo')).toBeTruthy()
  })
})
