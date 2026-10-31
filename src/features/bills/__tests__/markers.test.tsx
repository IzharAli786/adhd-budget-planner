// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0)) // Sat 31 Oct 2026, local
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  // Paid on the 15th; Sun 15 Nov 2026 moves to Fri 13 Nov.
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 15 },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
  await r.addFund({ name: 'Holiday', perPeriod: 4000, openingSaved: 0 })
  await r.addDebt({
    name: 'Card',
    balance: 250000,
    balanceAsOf: '2026-10-01',
    aprBps: 2000,
    minPayment: 3500,
    dueDay: 20,
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function openBills() {
  window.history.replaceState(null, '', '/bills')
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Next month' }))
  return within(await screen.findByRole('group', { name: 'November 2026' }))
}

describe('calendar markers', () => {
  it('a payday says what it sets aside, and a debt minimum is its own kind of bill', async () => {
    const days = await openBills()
    expect(
      days.getByRole('button', { name: /^Friday,? 13 November/ }).getAttribute('aria-label'),
    ).toMatch(/payday, set aside €40\.00$/)
    expect(
      days.getByRole('button', { name: /^Friday,? 20 November/ }).getAttribute('aria-label'),
    ).toMatch(/1 bill, debt minimum$/)
    // Savings ride on the payday ring: no mark or legend entry of their own (less clutter).
    expect(screen.queryByText('Savings')).toBeNull()
    expect(screen.getByText('Debt minimum')).toBeTruthy()

    await userEvent.click(days.getByRole('button', { name: /^Friday,? 13 November/ }))
    const payday = await screen.findByRole('dialog', { name: /13 November/ })
    expect(within(payday).getByText('Set aside €40.00 for Holiday')).toBeTruthy()
  })

  it('debt minimums are listed apart in the day sheet', async () => {
    const days = await openBills()
    await userEvent.click(days.getByRole('button', { name: /^Friday,? 20 November/ }))
    const sheet = await screen.findByRole('dialog', { name: /20 November/ })
    const debts = within(sheet).getByRole('region', { name: 'Debt minimums' })
    expect(within(debts).getByRole('button', { name: 'Mark Card paid' })).toBeTruthy()
    expect(within(debts).getByText('Debt minimum')).toBeTruthy()
  })

  it('a day note is written in the day sheet and marks the day', async () => {
    const days = await openBills()
    await userEvent.click(days.getByRole('button', { name: /^Tuesday,? 3 November/ }))
    const sheet = await screen.findByRole('dialog', { name: /3 November/ })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Add a note' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Note' }), 'Car service at 9')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save note' }))
    await waitFor(async () =>
      expect((await r.getNote({ date: '2026-11-03' }))?.text).toBe('Car service at 9'),
    )
    await waitFor(() =>
      expect(
        days.getByRole('button', { name: /^Tuesday,? 3 November/ }).getAttribute('aria-label'),
      ).toMatch(/, note$/),
    )
  })
})
