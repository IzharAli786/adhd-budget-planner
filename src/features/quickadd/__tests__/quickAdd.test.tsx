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
  it('the floating "Track spending" button is on every screen, Today included', async () => {
    window.history.replaceState(null, '', '/')
    render(<App />)
    // Today has no field of its own any more, so the button is how spending gets logged.
    expect(await screen.findByRole('button', { name: 'Track spending' })).toBeTruthy()
    await userEvent.click(screen.getAllByRole('link', { name: 'Calendar' })[0]!)
    expect(await screen.findByRole('button', { name: 'Track spending' })).toBeTruthy()
  })

  it('`n` opens it amount-first and saves an expense', async () => {
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await screen.findByRole('button', { name: 'Track spending' })
    await userEvent.keyboard('n')
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
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
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Track spending' })).toBeNull())
  })

  it('`n` does nothing while typing', async () => {
    window.history.replaceState(null, '', '/bills?view=paydays')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add your pay' }))
    const income = await screen.findByRole('dialog', { name: 'Add income' })
    await userEvent.type(within(income).getByRole('textbox', { name: 'Name' }), 'Nina')
    expect(screen.queryByRole('dialog', { name: 'Track spending' })).toBeNull()
  })

  it('a backdated entry is saved straight away, with no bank-balance question', async () => {
    await r.addCheckIn(50000, '2026-11-04', new Date(2026, 10, 4, 9, 0).toISOString())
    window.history.replaceState(null, '', '/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '30')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Yesterday' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))
    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ amount: -3000, date: '2026-11-03' }),
      ]),
    )
    expect(screen.queryByRole('dialog', { name: /already in your bank balance/ })).toBeNull()
    expect((await r.listTransactions())[0]!.inBalance).toBeUndefined()
  })

  it('"Got money" is always income: no envelope picker, never a hidden refund', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    const food = await r.addEnvelope({ name: 'Groceries', budget: 20000, color: 'sage' })
    // Earlier spending with this note: the sheet used to auto-pick Groceries from it.
    await r.addTransaction({
      date: '2026-11-02',
      amount: -3160,
      note: 'Groceries',
      envelopeId: food.id,
    })
    window.history.replaceState(null, '', '/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
    // Spending offers envelopes; "Got money" does not.
    // Envelopes load from the database a moment after the sheet opens.
    expect(await within(sheet).findByRole('group', { name: 'Envelope' })).toBeTruthy()
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Got money' }))
    expect(within(sheet).queryByRole('group', { name: 'Envelope' })).toBeNull()
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '100')
    await userEvent.type(within(sheet).getByRole('textbox', { name: /What for/ }), 'Groceries')
    expect(within(sheet).queryByText(/Suggested from what you logged before/)).toBeNull()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add it' }))
    await waitFor(async () => {
      const got = (await r.listTransactions()).find((t) => t.amount === 10000)
      expect(got).toBeTruthy()
      expect(got!.envelopeId).toBeUndefined()
    })
  })

  it('a recent chip logs again in one tap', async () => {
    await r.addTransaction({ date: '2026-11-03', amount: -320, note: 'Coffee' })
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
    await userEvent.click(
      await within(sheet).findByRole('button', { name: 'Log Coffee €3.20 again' }),
    )
    await waitFor(async () => expect(await r.listTransactions()).toHaveLength(2))
    expect((await r.listTransactions()).at(-1)).toMatchObject({ date: '2026-11-04', amount: -320 })
  })

  it('names the budget the spending came out of, which is why "until payday" holds', async () => {
    await r.updateSettings({ envelopesEnabled: true, simpleMode: false })
    const everyday = await r.ensureDefaultEnvelope()
    await r.updateEnvelope(everyday.id, { budget: 5000 })
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '12')
    await userEvent.type(within(sheet).getByRole('textbox', { name: /What for/ }), 'coffee')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))
    expect(await screen.findByText('Logged €12.00 · coffee · from Everyday budget')).toBeTruthy()
  })

  it('a sheet opened before midnight and saved after it logs on the new day', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 23, 59))
    window.history.replaceState(null, '', '/bills')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
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
