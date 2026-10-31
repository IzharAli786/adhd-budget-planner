// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { calendarDayLabel } from '../describe'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0)) // Sat 31 Oct 2026, local
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const rent = () =>
  r.addBill({
    name: 'Rent',
    amount: 95000,
    rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
    autopay: false,
  })

function renderBills() {
  window.history.replaceState(null, '', '/bills')
  render(<App />)
}

describe('calendarDayLabel', () => {
  const f = { dayLong: (d: string) => d }
  const due = { status: 'due' as const }
  const paid = { status: 'paid' as const }
  it.each([
    ['2026-10-31', [], 0, 'Today, 2026-10-31'],
    ['2026-11-01', [due], 1, '2026-11-01, 1 bill, payday'],
    ['2026-11-01', [due, paid], 0, '2026-11-01, 2 bills, 1 paid'],
    ['2026-10-01', [paid], 0, '2026-10-01, 1 bill, paid'],
    ['2026-10-01', [paid, paid], 2, '2026-10-01, 2 bills, all paid, 2 paydays'],
    ['2026-10-01', [due, paid], 0, '2026-10-01, 2 bills, 1 unpaid'],
    ['2026-10-01', [due], 0, '2026-10-01, 1 bill, unpaid'],
  ])('%s %j', (date, bills, paydays, expected) => {
    expect(calendarDayLabel(date, '2026-10-31', bills, paydays, f)).toBe(expected)
  })
})

describe('month calendar', () => {
  it('is one Tab stop, and arrows walk the days across months', async () => {
    await rent()
    renderBills()
    const today = await screen.findByRole('button', { name: /^Today, Saturday,? 31 October/ })
    const days = within(screen.getByRole('group', { name: 'October 2026' }))
    expect(days.getAllByRole('button').filter((b) => b.tabIndex === 0)).toEqual([today])

    today.focus()
    await userEvent.keyboard('{ArrowRight}')
    // Nov 1 sits in October's grid, so the month stays; one more week leaves the grid.
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(
      /^Sunday,? 1 November, 1 bill/,
    )
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('group', { name: 'November 2026' })).toBeTruthy())
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Sunday,? 15 November/)
    await userEvent.keyboard('{PageUp}')
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Thursday,? 15 October/),
    )
  })
})

describe('bill list after edits', () => {
  it('a split at tomorrow does not list the bill twice', async () => {
    const bill = await rent()
    await r.editBillFrom(bill.id, '2026-11-01', { amount: 99000 })
    renderBills()
    expect(await screen.findByRole('heading', { name: 'All bills · 1' })).toBeTruthy()
  })

  it('changing the day for all bills keeps last month paid', async () => {
    const bill = await rent()
    await r.markPaid(bill.id, '2026-10-01', 95000)
    renderBills()
    await userEvent.click(await screen.findByRole('button', { name: /^Rent €950/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Rent' })
    const date = within(sheet).getByLabelText('First due on')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-01-05')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(async () => expect(await r.listBills()).toHaveLength(2))
    // Nothing turned overdue: October 1 is still the paid one.
    expect(screen.queryByRole('heading', { name: 'Overdue' })).toBeNull()
    expect((await r.listOccurrences(bill.id))[0]).toMatchObject({ paidAmount: 95000 })
  })
})
