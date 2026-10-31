// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

const NOW = new Date(2026, 10, 4, 12, 0) // Wed 4 Nov 2026

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Transactions', () => {
  it('shows an empty state with the next step', async () => {
    window.history.replaceState(null, '', '/more/transactions')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Nothing logged yet' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Today' })).toBeTruthy()
  })

  it('groups by day, edits, deletes and undoes', async () => {
    await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'coffee' })
    await r.addTransaction({ date: '2026-11-02', amount: 5000, note: 'refund' })
    window.history.replaceState(null, '', '/more/transactions')
    render(<App />)
    expect(await screen.findByText(/Monday,? 2 November/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Today/ })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /coffee/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit entry' })
    const amount = within(sheet).getByRole('textbox', { name: 'Amount' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '13')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () =>
      expect((await r.listTransactions()).find((t) => t.note === 'coffee')?.amount).toBe(-1300),
    )

    await userEvent.click(await screen.findByRole('button', { name: /coffee/ }))
    const again = await screen.findByRole('dialog', { name: 'Edit entry' })
    await userEvent.click(within(again).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(1))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(2))
  })
})
