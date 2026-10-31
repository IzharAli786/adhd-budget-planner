// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0)) // Sat 31 Oct 2026
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Paydays', () => {
  it('adds the first income from the empty state', async () => {
    window.history.replaceState(null, '', '/bills?view=paydays')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add your pay' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add income' })
    // Validation first: nothing is saved without a name and amount.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add income' }))
    expect(within(sheet).getByText(/like “Salary”/)).toBeTruthy()
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Salary')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount each payday' }), '2100')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add income' }))
    await waitFor(async () =>
      expect(await r.listIncomes()).toEqual([
        expect.objectContaining({
          name: 'Salary',
          amount: 210000,
          schedule: { kind: 'monthly', day: 'last' },
          weekendRule: 'before',
          primary: true,
          active: true,
        }),
      ]),
    )
    // Nov 30 2026 is a Monday, so no weekend shift.
    expect(await screen.findByText('Monday, 30 November')).toBeTruthy()

    await userEvent.click(screen.getByRole('radio', { name: 'Bills' }))
    expect(await screen.findByText('No bills yet')).toBeTruthy()
  })

  it('"paid early": moves one payday and can move it back', async () => {
    const income = await r.addIncome({
      name: 'Salary',
      amount: 210000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    })
    window.history.replaceState(null, '', '/bills?view=paydays')
    render(<App />)
    await userEvent.click(
      await screen.findByRole('button', { name: /Move the Salary payday on Mon(day)?,? 30 Nov/ }),
    )
    const sheet = await screen.findByRole('dialog', { name: 'Move this payday' })
    const input = within(sheet).getByLabelText('Paid on')
    await userEvent.clear(input)
    await userEvent.type(input, '2026-11-27')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Move payday' }))
    await waitFor(async () =>
      expect(await r.listPaydayOverrides(income.id)).toEqual([
        expect.objectContaining({ originalDate: '2026-11-30', date: '2026-11-27' }),
      ]),
    )
    expect(await screen.findByText(/moved from/)).toBeTruthy()
    await userEvent.click(
      await screen.findByRole('button', { name: /Move the Salary payday on Fri(day)?,? 27 Nov/ }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Back to the usual day' }))
    await waitFor(async () => expect(await r.listPaydayOverrides(income.id)).toEqual([]))
  })
})
