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

describe('Quick add sheet', () => {
  it('the floating + is on other tabs, not on Today', async () => {
    window.history.replaceState(null, '', '/')
    render(<App />)
    await screen.findByRole('heading', { name: 'Today' })
    expect(screen.queryByRole('button', { name: 'Quick add' })).toBeNull()
    await userEvent.click(screen.getByRole('link', { name: 'Bills' }))
    expect(await screen.findByRole('button', { name: 'Quick add' })).toBeTruthy()
  })

  it('`n` opens it amount-first and saves an expense', async () => {
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await screen.findByRole('button', { name: 'Quick add' })
    await userEvent.keyboard('n')
    const sheet = await screen.findByRole('dialog', { name: 'Quick add' })
    const amount = within(sheet).getByRole('textbox', { name: 'Amount' })
    await waitFor(() => expect(document.activeElement).toBe(amount))
    expect(amount.getAttribute('inputmode')).toBe('decimal')
    await userEvent.type(amount, '4,20')
    await userEvent.type(within(sheet).getByRole('textbox', { name: /What for/ }), 'Bus')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))
    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ amount: -420, note: 'Bus', date: '2026-11-04' }),
      ]),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull())
  })

  it('`n` does nothing while typing', async () => {
    window.history.replaceState(null, '', '/bills?view=paydays')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add your pay' }))
    const income = await screen.findByRole('dialog', { name: 'Add income' })
    await userEvent.type(within(income).getByRole('textbox', { name: 'Name' }), 'Nina')
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).toBeNull()
  })

  it('a backdated entry asks whether it is already in the balance', async () => {
    await r.addCheckIn(50000, '2026-11-04', new Date(2026, 10, 4, 9, 0).toISOString())
    window.history.replaceState(null, '', '/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }))
    const sheet = await screen.findByRole('dialog', { name: 'Quick add' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '30')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Yesterday' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))
    const ask = await screen.findByRole('dialog', { name: 'Is this already in your bank balance?' })
    await userEvent.click(within(ask).getByRole('button', { name: 'Yes, it’s in there' }))
    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ amount: -3000, date: '2026-11-03', inBalance: true }),
      ]),
    )
  })

  it('a recent chip logs again in one tap', async () => {
    await r.addTransaction({ date: '2026-11-03', amount: -320, note: 'Coffee' })
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }))
    const sheet = await screen.findByRole('dialog', { name: 'Quick add' })
    await userEvent.click(
      await within(sheet).findByRole('button', { name: 'Log Coffee €3.20 again' }),
    )
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(2))
    expect((await r.listTransactions()).at(-1)).toMatchObject({ date: '2026-11-04', amount: -320 })
  })

  it('a sheet opened before midnight and saved after it logs on the new day', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59))
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }))
    const sheet = await screen.findByRole('dialog', { name: 'Quick add' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '5')
    vi.setSystemTime(new Date(2026, 10, 5, 0, 1))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))
    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ amount: -500, date: '2026-11-05' }),
      ]),
    )
  })
})
