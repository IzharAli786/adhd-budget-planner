// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { db } from '../../../db/schema'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// Wed 4 Nov 2026, noon local.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false })
  localStorage.clear()
  window.history.replaceState(null, '', '/savings')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Savings', () => {
  it('is its own section: title, then the totals across every fund, then each fund', async () => {
    await r.addFund({ name: 'Cushion', perPeriod: 0, openingSaved: 12000, target: 40000 })
    await r.addFund({ name: 'Lisbon', perPeriod: 2500, openingSaved: 8000, target: 20000 })
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Savings' })).toBeTruthy()
    // The first strip is the full one, with the total saved.
    const [totals] = await screen.findAllByRole('region', { name: 'Savings totals' })
    expect(within(totals!).getByText('Total saved')).toBeTruthy()
    expect(within(totals!).getByText('€200.00')).toBeTruthy()
    expect(within(totals!).getByText('€600.00')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: 'Cushion progress' }).getAttribute('aria-valuenow'),
    ).toBe('30')
    expect(
      screen.getByRole('progressbar', { name: 'Lisbon progress' }).getAttribute('aria-valuenow'),
    ).toBe('40')
    expect(screen.getAllByRole('button', { name: 'Add money' })).toHaveLength(2)
  })

  it('names the next step when empty, then adds a fund and money to it', async () => {
    render(<App />)
    expect(await screen.findByText('Start one small fund')).toBeTruthy()
    // No totals to show yet.
    expect(screen.queryByRole('region', { name: 'Savings totals' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'New savings fund' }))
    const sheet = await screen.findByRole('dialog', { name: 'New savings fund' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Holiday')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Each payday' }), '50')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Target (optional)' }), '500')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add fund' }))

    const ring = await screen.findByRole('progressbar', { name: 'Holiday progress' })
    expect(ring.getAttribute('aria-valuenow')).toBe('0')

    await userEvent.click(screen.getByRole('button', { name: 'Add money' }))
    const add = await screen.findByRole('dialog', { name: 'Add to Holiday' })
    // Prefilled with the per-payday amount.
    expect((within(add).getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe(
      '50',
    )
    await userEvent.click(within(add).getByRole('button', { name: 'Add money' }))

    await waitFor(() => expect(ring.getAttribute('aria-valuenow')).toBe('10'))
    expect(screen.getByText('of €500.00', { exact: false })).toBeTruthy()
    const [totals] = screen.getAllByRole('region', { name: 'Savings totals' })
    await waitFor(() => expect(within(totals!).getByText('€50.00')).toBeTruthy())
    // Stored as a fundId transaction leaving the balance (PLAN §3.3).
    const [tx] = await db.transactions.toArray()
    expect(tx).toMatchObject({ amount: -5000, date: '2026-11-04' })
    expect(tx!.fundId).toBeTruthy()
  })

  it('says the pace per payday to reach a target by a date', async () => {
    await r.addIncome({
      name: 'Salary',
      amount: 210000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    })
    await r.addFund({
      name: 'Laptop',
      target: 60000,
      targetDate: '2027-01-31',
      perPeriod: 0,
      openingSaved: 0,
    })
    render(<App />)
    // Paydays Mon 30 Nov, Thu 31 Dec, Fri 29 Jan: €600 / 3.
    expect(await screen.findByText(/About €200\.00 per payday to reach it by/)).toBeTruthy()
  })

  it('never takes out more than is in the fund', async () => {
    await r.addFund({ name: 'Cushion', perPeriod: 0, openingSaved: 3000 })
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add money' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add to Cushion' })
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Take out' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '40')
    expect(within(sheet).getByText(/more than the €30\.00 in it/)).toBeTruthy()
    const go = within(sheet).getByRole('button', { name: 'Take it out' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    await userEvent.clear(within(sheet).getByRole('textbox', { name: 'Amount' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '30')
    await userEvent.click(go)
    await waitFor(async () => expect(await db.transactions.toArray()).toHaveLength(1))
    expect((await db.transactions.toArray())[0]).toMatchObject({ amount: 3000 })
  })

  it('is a Full-mode section: Simple mode goes back to Today', async () => {
    await r.updateSettings({ simpleMode: true })
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/'))
  })
})
