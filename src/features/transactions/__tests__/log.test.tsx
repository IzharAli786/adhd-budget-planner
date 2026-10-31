// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

const NOW = new Date(2026, 10, 4, 12, 0) // Wed 4 Nov 2026; this period began Fri 30 Oct

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  await r.updateSettings({ envelopesEnabled: true })
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
  const eating = await r.addEnvelope({ name: 'Eating out', budget: 0, color: 'amber' })
  const food = await r.addEnvelope({ name: 'Groceries', budget: 0, color: 'sage' })
  await r.addTransaction({
    date: '2026-11-02',
    amount: -1200,
    note: 'coffee',
    envelopeId: eating.id,
  })
  await r.addTransaction({ date: '2026-11-03', amount: 5000, note: 'refund' })
  await r.addTransaction({ date: '2026-10-31', amount: -800, note: 'Bus' })
  await r.addTransaction({
    date: '2026-10-15',
    amount: -4000,
    note: 'Lidl groceries',
    envelopeId: food.id,
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function open() {
  window.history.replaceState(null, '', '/more/transactions')
  render(<App />)
  return screen.findByRole('region', { name: 'Totals' })
}
const listed = () =>
  screen
    .queryAllByRole('button', { name: /coffee|refund|Bus|Lidl/ })
    .map((b) => b.textContent?.match(/coffee|refund|Bus|Lidl/)?.[0])

describe('Transaction log', () => {
  it('starts on this pay period with its count and totals in and out', async () => {
    const totals = await open()
    const period = screen.getByRole('group', { name: 'Period' })
    expect(
      within(period).getByRole('button', { name: 'This pay period' }).getAttribute('aria-pressed'),
    ).toBe('true')
    await waitFor(() => expect(listed()).toEqual(['refund', 'coffee', 'Bus']))
    expect(within(totals).getByText(/3 of 4 entries/)).toBeTruthy()
    expect(within(totals).getByText('€20.00')).toBeTruthy() // out
    // In: the refund plus the salary of Fri 30 Oct, as Plan counts this period's income.
    expect(within(totals).getByText('€2,150.00')).toBeTruthy()
    expect(within(totals).getByText('Pay included: €2,100.00')).toBeTruthy()
    // Envelope chip per row.
    const coffee = screen.getByRole('button', { name: /coffee/ })
    expect(await within(coffee).findByText('Eating out')).toBeTruthy()
  })

  it('switches to the last pay period, a month, or everything', async () => {
    await open()
    const period = screen.getByRole('group', { name: 'Period' })
    await userEvent.click(within(period).getByRole('button', { name: 'Last pay period' }))
    await waitFor(() => expect(listed()).toEqual(['Lidl']))

    const months = screen.getByRole('group', { name: 'Months in 2026' })
    await userEvent.click(within(months).getByRole('button', { name: 'Oct 2026' }))
    await waitFor(() => expect(listed()).toEqual(['Bus', 'Lidl']))

    await userEvent.click(within(period).getByRole('button', { name: 'All' }))
    await waitFor(() => expect(listed()).toEqual(['refund', 'coffee', 'Bus', 'Lidl']))
  })

  it('shows every month of the year so far, and switches year once entries span two', async () => {
    await open()
    const months = screen.getByRole('group', { name: 'Months in 2026' })
    // January up to this month; nothing ahead. (Short names vary by ICU: "Sep"/"Sept".)
    const chips = within(months).getAllByRole('button')
    expect(chips).toHaveLength(11)
    expect(chips[0]!.textContent).toBe('Jan 2026')
    expect(chips[10]!.textContent).toBe('Nov 2026')
    expect(screen.queryByRole('group', { name: 'Year' })).toBeNull()
    cleanup()

    await r.addTransaction({ date: '2025-12-20', amount: -2500, note: 'Bus' })
    await open()
    const years = screen.getByRole('group', { name: 'Year' })
    await userEvent.click(within(years).getByRole('button', { name: '2025' }))
    const old = screen.getByRole('group', { name: 'Months in 2025' })
    expect(within(old).getAllByRole('button')).toHaveLength(12)
    await userEvent.click(within(old).getByRole('button', { name: 'Dec 2025' }))
    await waitFor(() => expect(listed()).toEqual(['Bus']))
  })

  it('totals show the count and the average per spending entry', async () => {
    const totals = await open()
    await waitFor(() => expect(listed()).toEqual(['refund', 'coffee', 'Bus']))
    // Two spends, €12 and €8: €10 on average. The refund is money in, not averaged with them.
    expect(within(totals).getByText('Entries').nextSibling?.textContent).toBe('3')
    expect(within(totals).getByText('Average spend').nextSibling?.textContent).toBe('€10.00')
  })

  it('searches notes and filters by envelope, with a way back', async () => {
    const totals = await open()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'COF')
    await waitFor(() => expect(listed()).toEqual(['coffee']))
    expect(within(totals).getByText(/1 of 4 entries/)).toBeTruthy()

    await userEvent.clear(screen.getByRole('searchbox', { name: 'Search notes' }))
    const filter = screen.getByRole('group', { name: 'Envelope' })
    // Only envelopes used in this period, plus entries without one.
    expect(
      within(filter)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Eating out', 'No envelope'])
    await userEvent.click(within(filter).getByRole('button', { name: 'No envelope' }))
    await waitFor(() => expect(listed()).toEqual(['refund', 'Bus']))

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search notes' }), 'nothing like it')
    expect(await screen.findByText('Nothing matches in this period.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(listed()).toEqual(['refund', 'coffee', 'Bus']))
  })

  it('exports exactly the selection as CSV', async () => {
    const totals = await open()
    const link = await within(totals).findByRole('link', { name: 'Export for spreadsheets (CSV)' })
    expect(link.getAttribute('download')).toBe('steady-transactions-2026-10-30-to-2026-11-29.csv')
  })

  it('an entry in a deleted envelope keeps its label and filter chip', async () => {
    const eating = (await r.listEnvelopes()).find((e) => e.name === 'Eating out')!
    await r.deleteEnvelope(eating.id)
    await open()
    const coffee = await screen.findByRole('button', { name: /coffee/ })
    await waitFor(() => expect(within(coffee).getByText('Eating out')).toBeTruthy())
    const filter = screen.getByRole('group', { name: 'Envelope' })
    expect(within(filter).getByRole('button', { name: 'Eating out' })).toBeTruthy()
  })

  it('editing still works from a filtered list, with undo', async () => {
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /coffee/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit entry' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(listed()).toEqual(['refund', 'Bus']))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(listed()).toEqual(['refund', 'coffee', 'Bus']))
  })
})
