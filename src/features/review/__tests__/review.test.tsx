// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString()
const goto = (path: string) => window.history.replaceState(null, '', path)

async function salary() {
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
}

// Wed 4 Nov 2026. Steady was first used on Sun 25 Oct; payday was Fri 30 Oct.
async function seedHistory() {
  await salary()
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

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 4, 12, 0))
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false })
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Look back', () => {
  it('is one tap from More', async () => {
    goto('/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /Look back/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Look back' })).toBeTruthy()
  })

  it('explains itself before there is anything to show', async () => {
    await salary()
    goto('/more/review')
    render(<App />)
    expect(await screen.findByText('Nothing to look back on in 2026 yet')).toBeTruthy()
  })

  it('shows the year month by month, counting pay only from when Steady was used', async () => {
    await seedHistory()
    goto('/more/review')
    render(<App />)
    const table = await screen.findByRole('table')
    const october = within(table).getByRole('row', { name: /October 2026/ })
    // In: the 30 Oct salary only (nothing from before 25 Oct). Out: the groceries.
    expect(within(october).getByText('€2,100.00')).toBeTruthy()
    expect(within(october).getByText('€20.00')).toBeTruthy()
    const november = within(table).getByRole('row', { name: /November 2026/ })
    expect(within(november).getByText('€912.00')).toBeTruthy() // rent + coffee
    expect(within(table).queryByRole('row', { name: /September 2026/ })).toBeNull()
    expect(within(table).queryByRole('row', { name: /December 2026/ })).toBeNull()

    const tiles = screen.getByRole('region', { name: '2026 at a glance' })
    // 2100 in, 932 out: 1168 left over.
    expect(within(tiles).getByText('€1,168.00')).toBeTruthy()
    // The chart is an image with words, and its numbers are all in the table.
    expect(
      await screen.findByRole('img', { name: /Money in and out per month, 2026/ }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous year' }).hasAttribute('disabled')).toBe(
      true,
    )
    expect(screen.getByRole('button', { name: 'Next year' }).hasAttribute('disabled')).toBe(true)
  })

  it('says "so far" when a year still under way is behind on paper', async () => {
    // Steady started on 1 Nov; rent went out that day and the salary comes on the 30th.
    await salary()
    await r.addCheckIn(150000, '2026-11-01', local(11, 1))
    const rent = await r.addBill({
      name: 'Rent',
      amount: 90000,
      rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
      autopay: false,
    })
    await r.markPaid(rent.id, '2026-11-01', 90000)
    goto('/more/review')
    render(<App />)
    const tiles = await screen.findByRole('region', { name: '2026 at a glance' })
    expect(within(tiles).getByText('More out than in so far')).toBeTruthy()
    expect(within(tiles).getByText('€900.00')).toBeTruthy()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('row', { name: /November 2026 \(so far\)/ })).toBeTruthy()
  })

  it('per payday, shows what was carried into each payday', async () => {
    await seedHistory()
    goto('/more/review')
    render(<App />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('radio', { name: 'Per payday' }))
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Carried in' })).toBeTruthy()
    // €500 on 25 Oct, €20 spent since: €480 when the pay came on 30 Oct.
    const row = within(table).getByRole('row', { name: /Fri,? 30 Oct/ })
    expect(within(row).getByText('€480.00')).toBeTruthy()
    expect(screen.getByText('You carried €480.00 into this payday.')).toBeTruthy()
  })

  it('prints a clean report of the year, then puts the screen back', async () => {
    await seedHistory()
    const print = vi.fn()
    window.print = print
    goto('/more/review')
    const { container } = render(<App />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Print this year' }))
    const periodTable = screen.getByRole('region', { name: 'Period table' })
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    const report = container.querySelector('.print-report')!
    expect(report).toBeTruthy()
    expect(within(report as HTMLElement).getByRole('heading', { name: '2026' })).toBeTruthy()
    for (const section of ['Summary', 'By period', 'Where it went', 'Bills paid'])
      expect(within(report as HTMLElement).getByRole('heading', { name: section })).toBeTruthy()
    expect(within(report as HTMLElement).getByText('Rent')).toBeTruthy()
    // The screen itself steps aside for the paper.
    expect(periodTable.closest('.print-hide')).toBeTruthy()

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    await waitFor(() => expect(container.querySelector('.print-report')).toBeNull())
  })

  it('shows savings and debt for the year, as a list or a table, and prints both', async () => {
    await seedHistory()
    const fund = await r.addFund({
      name: 'Holiday',
      target: 100000,
      perPeriod: 5000,
      openingSaved: 10000,
    })
    await r.addToFund(fund, 15000, '2026-10-30')
    await r.addDebt({
      name: 'Card',
      balance: 120000,
      balanceAsOf: '2026-10-25',
      aprBps: 2000,
      minPayment: 3500,
      dueDay: 2,
    })
    const card = (await r.listBills()).find((b) => b.debtId)!
    await r.markPaid(card.id, '2026-11-02', 3500)
    const print = vi.fn()
    window.print = print
    goto('/more/review')
    const { container } = render(<App />)

    const savings = await screen.findByRole('region', { name: 'Savings this year' })
    expect(within(savings).getByText(/€150\.00 moved into your funds this year/)).toBeTruthy()
    await userEvent.click(within(savings).getByRole('button', { name: 'Show as a table' }))
    const fundRow = within(within(savings).getByRole('table')).getByRole('row', { name: /Holiday/ })
    expect(within(fundRow).getByText('+€150.00')).toBeTruthy()
    expect(within(fundRow).getByText(/25\s?%/)).toBeTruthy() // 250 of 1,000

    const debt = screen.getByRole('region', { name: 'Debt this year' })
    await userEvent.click(within(debt).getByRole('button', { name: 'Show as a table' }))
    const debtTable = within(debt).getByRole('table')
    const cardRow = within(debtTable).getByRole('row', { name: /^Card/ })
    expect(within(cardRow).getByText('€35.00')).toBeTruthy()
    expect(within(cardRow).getByText('€1,200.00')).toBeTruthy()
    // The interest figure says what it is: a rough estimate.
    expect(within(debtTable).getByText(/estimate at today’s balances/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Print this year' }))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    const report = container.querySelector('.print-report') as HTMLElement
    expect(within(report).getByRole('heading', { name: 'Savings this year' })).toBeTruthy()
    expect(within(report).getByRole('heading', { name: 'Debt this year' })).toBeTruthy()
  })

  it('prints the latest period on its own', async () => {
    await seedHistory()
    const print = vi.fn()
    window.print = print
    goto('/more/review')
    const { container } = render(<App />)
    await screen.findByRole('table')
    await userEvent.click(screen.getByRole('button', { name: 'Print this period' }))
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    const report = container.querySelector('.print-report') as HTMLElement
    expect(within(report).getByRole('heading', { name: 'November 2026' })).toBeTruthy()
    expect(within(report).queryByRole('heading', { name: 'By period' })).toBeNull()
  })
})

describe('Insights on Plan', () => {
  it('shows where this period’s money is going, and the same numbers as a table', async () => {
    await seedHistory()
    goto('/plan')
    render(<App />)
    const insights = await screen.findByRole('region', { name: 'Insights' })
    expect(within(insights).getByText(/money is going, by kind/)).toBeTruthy()
    // Legend: rent and coffee since payday (30 Oct), with their share.
    expect((await within(insights).findAllByText('Bills')).length).toBeGreaterThan(0)
    await userEvent.click(within(insights).getByRole('button', { name: 'Show as a table' }))
    const table = within(insights).getByRole('table')
    const bills = within(table).getByRole('row', { name: /Bills/ })
    expect(within(bills).getAllByText('€900.00')).toHaveLength(2) // planned and actual
    expect(within(bills).getByText(/98\.7\s?%/)).toBeTruthy()
    const everyday = within(table).getByRole('row', { name: /Everyday/ })
    expect(within(everyday).getByText('€12.00')).toBeTruthy()
  })

  it('groups by envelope when envelopes are on, with plan vs actual', async () => {
    await seedHistory()
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    const food = await r.addEnvelope({ name: 'Food', budget: 1000, color: 'accent' })
    await r.addTransaction({ date: '2026-11-03', amount: -1500, note: 'shop', envelopeId: food.id })
    goto('/plan')
    render(<App />)
    const insights = await screen.findByRole('region', { name: 'Insights' })
    expect(within(insights).getByText(/money is going, by envelope/)).toBeTruthy()
    // Over the plan reads as calm words, never red.
    expect(await within(insights).findByText(/€5\.00 past the plan/)).toBeTruthy()
    // Rent is in no envelope, yet still shows where the money goes; Everyday has no budget.
    await userEvent.click(within(insights).getByRole('button', { name: 'Show as a table' }))
    const table = within(insights).getByRole('table')
    const bills = within(table).getByRole('row', { name: /Bills/ })
    expect(within(bills).getAllByText('€900.00')).toHaveLength(2)
    const everyday = within(table).getByRole('row', { name: /Everyday/ })
    expect(within(everyday).getByText('No budget yet')).toBeTruthy()
  })

  it('says “no budget yet” for spending in an envelope without one, with no plan track', async () => {
    await seedHistory()
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    goto('/plan')
    const { container } = render(<App />)
    const insights = await screen.findByRole('region', { name: 'Insights' })
    // Everyday: the €12 coffee since payday, in an envelope with no budget.
    expect(await within(insights).findByText(/spent · no budget yet/)).toBeTruthy()
    // Its legend colour is the envelope's own (Everyday follows the accent).
    const swatches = [...container.querySelectorAll<HTMLElement>('figure [aria-hidden] span')]
    expect(swatches.some((el) => el.style.background === 'var(--accent)')).toBe(true)
  })
})
