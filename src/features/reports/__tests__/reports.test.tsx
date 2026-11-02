// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { db } from '../../../db/schema'
import { buildReport } from '../../../domain/report'
import { formatMoney } from '../../../domain/money'

// The PDF itself is tested in reportPdf.test.ts (Node); here it is a ready file.
vi.mock('../reportPdf', () => ({
  renderReportFile: vi.fn(
    async (report: { meta: { from: string; to: string } }) =>
      new File(['%PDF-1.3'], `steady-report-${report.meta.from}_to_${report.meta.to}.pdf`, {
        type: 'application/pdf',
      }),
  ),
}))

const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString()
const goto = (path: string) => window.history.replaceState(null, '', path)

// Wed 4 Nov 2026. Salary on the last weekday of the month: Wed 30 Sep, Fri 30 Oct, Mon 30 Nov.
async function seed() {
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
  await r.addCheckIn(50000, '2026-10-25', local(10, 25))
  await r.addTransaction({ date: '2026-10-26', amount: -2000, note: 'groceries' })
  await r.addTransaction({ date: '2026-11-02', amount: -1200, note: 'coffee' })
  const rent = await r.addBill({
    name: 'Rent',
    amount: 90000,
    rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
    autopay: false,
  })
  await r.markPaid(rent.id, '2026-11-01', 90000)
}

const from = () => screen.getByLabelText('From') as HTMLInputElement
const to = () => screen.getByLabelText('To') as HTMLInputElement
const createButton = () => screen.getByRole('button', { name: /Create PDF|Making your report/ })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0))
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Reports', () => {
  it('is one tap from More', async () => {
    goto('/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /Reports/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy()
    expect(screen.getByText('A PDF of everything in a date range.')).toBeTruthy()
  })

  it.each([
    ['This month', '2026-11-01', '2026-11-30'],
    ['This pay period', '2026-10-30', '2026-11-29'],
    ['Last pay period', '2026-09-30', '2026-10-29'],
    ['Last month', '2026-10-01', '2026-10-31'],
    ['This year', '2026-01-01', '2026-12-31'],
    ['Last 12 months', '2025-11-05', '2026-11-04'],
  ])('"%s" picks %s to %s', async (chip, start, end) => {
    await seed()
    goto('/more/reports')
    render(<App />)
    const group = await screen.findByRole('group', { name: 'Quick ranges' })
    await userEvent.click(within(group).getByRole('button', { name: chip }))
    expect(within(group).getByRole('button', { name: chip }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(from().value).toBe(start)
    expect(to().value).toBe(end)
  })

  it('keeps the button off, and says why, while the end is before the start', async () => {
    await seed()
    goto('/more/reports')
    render(<App />)
    await screen.findByRole('group', { name: 'Quick ranges' })
    fireEvent.change(from(), { target: { value: '2026-12-05' } })
    expect(await screen.findByText('The end date is before the start date.')).toBeTruthy()
    expect(createButton().hasAttribute('disabled')).toBe(true)
    // Typing a date makes the range Custom.
    expect(screen.getByRole('button', { name: 'Custom' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(to(), { target: { value: '2026-12-31' } })
    await waitFor(() => expect(createButton().hasAttribute('disabled')).toBe(false))
  })

  it('marks the field that is wrong and announces it', async () => {
    await seed()
    goto('/more/reports')
    render(<App />)
    await screen.findByRole('group', { name: 'Quick ranges' })
    fireEvent.change(from(), { target: { value: '' } })
    expect(await screen.findByText('Pick a start date.')).toBeTruthy()
    expect(from().getAttribute('aria-invalid')).toBe('true')
    expect(from().getAttribute('aria-describedby')).toBe(screen.getByText('Pick a start date.').id)
    expect(to().getAttribute('aria-invalid')).toBeNull()
    const live = document.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toMatch(/Pick a start date\. Fix the dates above/)
    expect(createButton().hasAttribute('disabled')).toBe(true)
    // The end can't be picked before the start in the native picker either.
    fireEvent.change(from(), { target: { value: '2026-10-01' } })
    await waitFor(() => expect(to().getAttribute('min')).toBe('2026-10-01'))
    expect(live?.textContent).toBe('')
  })

  it('moves focus to the ready report, since the button pressed is gone', async () => {
    await seed()
    goto('/more/reports')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Last month' }))
    await userEvent.click(createButton())
    const ready = await screen.findByText('Your report is ready.')
    await waitFor(() => expect(document.activeElement).toBe(ready))
  })

  it('previews the same numbers as the report it will make', async () => {
    await seed()
    goto('/more/reports')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Last month' }))

    const [incomes, paydayOverrides, bills, occurrences, transactions, checkIns] =
      await Promise.all([
        db.incomes.toArray(),
        db.paydayOverrides.toArray(),
        db.bills.toArray(),
        db.billOccurrences.toArray(),
        db.transactions.toArray(),
        db.checkIns.toArray(),
      ])
    const report = buildReport(
      {
        today: '2026-11-04',
        incomes,
        paydayOverrides,
        bills,
        occurrences,
        transactions,
        checkIns,
        envelopes: [],
        envelopesEnabled: false,
        funds: [],
        debts: [],
        notes: [],
        noSpend: [],
        impulse: [],
        lifeGoals: [],
        currency: 'EUR',
        decimals: 2,
        locale: 'en-IE',
        generatedOn: '2026-11-04',
      },
      '2026-10-01',
      '2026-10-31',
    )
    const preview = screen.getByRole('region', { name: 'What’s in it' })
    const money = (c: number) => formatMoney(c, 'EUR', 'en-IE', 2)
    // October: the 30 Oct salary in (nothing before Steady was used), the groceries out.
    expect(report.summary.moneyIn).toBe(210000)
    expect(report.summary.moneyOut).toBe(2000)
    expect(within(preview).getByText(money(report.summary.moneyIn))).toBeTruthy()
    expect(within(preview).getByText(money(report.summary.moneyOut))).toBeTruthy()
    expect(within(preview).getByText(money(report.summary.leftOver))).toBeTruthy()
    expect(within(preview).getByText(/1 transaction · 0 bills paid/)).toBeTruthy()
  })

  it('says so when there is nothing in the range, and still makes the PDF', async () => {
    await seed()
    goto('/more/reports')
    render(<App />)
    await screen.findByRole('group', { name: 'Quick ranges' })
    fireEvent.change(from(), { target: { value: '2025-01-01' } })
    fireEvent.change(to(), { target: { value: '2025-01-31' } })
    expect(await screen.findByText(/Nothing logged in these dates yet/)).toBeTruthy()
    await userEvent.click(createButton())
    expect(await screen.findByText('Your report is ready.')).toBeTruthy()
    expect(screen.getByText('steady-report-2025-01-01_to_2025-01-31.pdf')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy()
    // Other dates: the made file no longer matches, so it's back to Create PDF.
    fireEvent.change(to(), { target: { value: '2025-02-28' } })
    expect(await screen.findByRole('button', { name: 'Create PDF' })).toBeTruthy()
  })
})
