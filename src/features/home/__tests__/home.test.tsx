// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// Wed 4 Nov 2026, planning by month. Tracking starts today with €842.50 (the check-in),
// and the €2,100 salary on Mon 30 Nov counts as November's money in (still to come).
// October's salary lands on Fri 30 Oct (the 31st is a Saturday).
const NOW = new Date(2026, 10, 4, 12, 0)
const EARLIER = new Date(2026, 10, 4, 8, 0).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false, envelopesEnabled: true })
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
  await r.addCheckIn(84250, '2026-11-04', EARLIER)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const goto = (path: string) => window.history.replaceState(null, '', path)

/** Food (€100 budget, €25 spent) and Fun (€50 budget, €75 spent), both today. */
async function seedEnvelopes() {
  const food = await r.addEnvelope({ name: 'Food', budget: 10000, color: 'sage' })
  const fun = await r.addEnvelope({ name: 'Fun', budget: 5000, color: 'plum' })
  await r.addTransaction({ date: '2026-11-04', amount: -2500, note: 'shop', envelopeId: food.id })
  await r.addTransaction({ date: '2026-11-04', amount: -7500, note: 'gig', envelopeId: fun.id })
  return { food, fun }
}

const region = (name: string) => screen.findByRole('region', { name })
const months = () => screen.findByRole('navigation', { name: 'Months' })
/** An arrow with nowhere to go: aria-disabled, so it keeps focus if it had it. */
const off = (button: HTMLElement) => button.getAttribute('aria-disabled') === 'true'
/** The closing sentence of Income vs spending. */
const verdict = (card: HTMLElement) => card.querySelector('p.border-t')?.textContent

describe('Home', () => {
  it('/plan now opens Home', async () => {
    goto('/plan')
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeTruthy()
    expect(window.location.pathname).toBe('/home')
  })

  it('does not step back before the first month with anything tracked', async () => {
    goto('/home')
    render(<App />)
    const nav = await months()
    expect(within(nav).getByText('November 2026')).toBeTruthy()
    const prev = within(nav).getByRole('button', { name: 'Previous month' })
    expect(off(prev)).toBe(true)
    expect(off(within(nav).getByRole('button', { name: 'Next month' }))).toBe(false)
    // A press on it does nothing, and focus stays put.
    prev.focus()
    await userEvent.keyboard('{Enter}')
    expect(within(nav).getByText('November 2026')).toBeTruthy()
    expect(document.activeElement).toBe(prev)
  })

  it('the month picker changes every block, and “This month” comes back with focus on the month', async () => {
    const { food } = await seedEnvelopes()
    await r.addTransaction({ date: '2026-10-15', amount: -4000, note: 'shop', envelopeId: food.id })
    goto('/home')
    render(<App />)
    const nav = await months()
    expect(within(nav).getByText('November 2026')).toBeTruthy()
    // Already on this month: no way "back" to offer (the button keeps its place, hidden).
    expect(within(nav).queryByRole('button', { name: 'This month' })).toBeNull()
    const ivs = await region('Income vs spending')
    const left = await region('Left to spend')
    expect(within(ivs).getByText('€100.00')).toBeTruthy()
    expect(within(left).getByText('€2,842.50')).toBeTruthy()
    expect(within(left).getByText('safe to spend')).toBeTruthy()

    await userEvent.click(within(nav).getByRole('button', { name: 'Previous month' }))
    expect(await within(nav).findByText('October 2026')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Budget vs. actuals — October' })).toBeTruthy()
    // October: €2,100 in, €40 out. Before tracking started, so nothing carried in.
    const october = await region('Income vs spending')
    expect(within(october).getByText('€40.00')).toBeTruthy()
    expect(verdict(october)).toBe('€2,060.00 more came in than went out.')
    const leftOct = await region('Left to spend')
    expect(within(leftOct).getByText('€2,060.00')).toBeTruthy()
    expect(within(leftOct).getByText('left over')).toBeTruthy()
    const dist = await region('Spending distribution')
    expect(
      within(dist)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Food€40.00 · 100%'])
    // Nothing tracked in September.
    expect(off(within(nav).getByRole('button', { name: 'Previous month' }))).toBe(true)

    await userEvent.click(within(leftOct).getByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    expect(within(sheet).getByText('Left over this period')).toBeTruthy()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Got it' }))

    await userEvent.click(within(nav).getByRole('button', { name: 'This month' }))
    expect(await within(nav).findByText('November 2026')).toBeTruthy()
    expect(document.activeElement?.textContent).toBe('November 2026')
    expect(screen.getByRole('heading', { name: 'Budget vs. actuals — November' })).toBeTruthy()
    expect(within(nav).queryByRole('button', { name: 'This month' })).toBeNull()
    expect(within(await region('Left to spend')).getByText('€2,842.50')).toBeTruthy()
  })

  it('income vs spending: says “coming in” while the month still has money to come', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const card = await region('Income vs spending')
    expect(within(card).getByText('€2,100.00')).toBeTruthy()
    expect(within(card).getByText('€100.00')).toBeTruthy()
    // The salary lands on the 30th: all of it is still to come.
    expect(
      within(card).getByText('Paydays and other income · €2,100.00 still to come'),
    ).toBeTruthy()
    expect(within(card).getByText('Bills €0.00 · spending €100.00')).toBeTruthy()
    expect(verdict(card)).toBe(
      '€2,000.00 more coming in than going out by the end of the month.' +
        'Starting balance: €842.50, counted on its own.',
    )
  })

  it('budget vs actuals: the name and planned / actual under each pair, the rest in words', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Budget vs. actuals — November' })
    expect(within(list).getByText('Food: planned €100.00, actual €25.00.')).toBeTruthy()
    expect(within(list).getByText('€100.00 / €25.00')).toBeTruthy()
    // Over budget is said in words: for screen readers, and in the tooltip.
    expect(
      within(list).getByText('Fun: planned €50.00, actual €75.00, over by €25.00.'),
    ).toBeTruthy()
    expect(within(list).getByTitle('Fun: €25.00 over plan')).toBeTruthy()
    expect(within(list).queryByText(/over plan/)).toBeNull()
  })

  it('spending distribution: biggest first, each with its own honest share', async () => {
    await seedEnvelopes()
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Spending distribution' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Fun€75.00 · 75%', 'Food€25.00 · 25%'])
  })

  it('spending distribution says what it counts: so far this month, or the whole month', async () => {
    await seedEnvelopes()
    // Some October spending, so the picker can step back to a finished month.
    await r.addTransaction({ date: '2026-10-12', amount: -4200, note: 'shop' })
    goto('/home')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Spending distribution' })
    expect(card.textContent).toMatch(/Spent so far in November\s*€100\.00/)
    expect(card.textContent).toContain('still to come join the chart on their date')
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Spending distribution' }).textContent).toMatch(
        /Spent in October\s*€42\.00/,
      ),
    )
  })

  it('spending distribution never calls real money 0%', async () => {
    const food = await r.addEnvelope({ name: 'Food', budget: 0, color: 'sage' })
    const fun = await r.addEnvelope({ name: 'Fun', budget: 0, color: 'plum' })
    await r.addTransaction({ date: '2026-11-04', amount: -25, note: 'gum', envelopeId: food.id })
    await r.addTransaction({ date: '2026-11-04', amount: -7500, note: 'gig', envelopeId: fun.id })
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Spending distribution' })
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Fun€75.00 · 100%', 'Food€0.25 · <1%'])
  })

  it('left to spend: safe to spend as the number, the bar is the money in, savings and debt in it', async () => {
    await seedEnvelopes()
    const fund = await r.addFund({ name: 'Holiday', perPeriod: 0, openingSaved: 0 })
    await r.addToFund(fund, 30000, '2026-11-04')
    const { debt } = await r.addDebt({
      name: 'Card',
      balance: 250000,
      balanceAsOf: '2026-10-01',
      aprBps: 2000,
      minPayment: 3500,
      dueDay: 20,
    })
    await r.addTransaction({ date: '2026-11-04', amount: -20000, note: 'Card', debtId: debt.id })
    goto('/home')
    render(<App />)
    const card = await region('Left to spend')
    // €842.50 + €2,100 − €100 spent. Savings and debt never lower it.
    expect(await within(card).findByText('€2,842.50')).toBeTruthy()
    expect(within(card).getByText('safe to spend')).toBeTruthy()
    const bar = within(card).getByRole('img')
    await waitFor(() =>
      expect(bar.getAttribute('aria-label')).toBe(
        '€2,942.50 in: Envelopes €100.00, Debt €200.00, Savings €300.00, Still free €2,342.50',
      ),
    )
    // The parts fill the bar exactly: together they are the money in.
    const widths = [...bar.querySelectorAll<HTMLElement>('[data-part]')].map((el) =>
      parseFloat(el.style.width),
    )
    expect(widths).toHaveLength(4)
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    expect(
      within(card).getByText(
        'Savings and debt show in the bar, but they never lower safe to spend.',
      ),
    ).toBeTruthy()

    await userEvent.click(within(card).getByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    expect(within(sheet).getByText('Safe to spend this period')).toBeTruthy()
    expect(within(sheet).getByText('€2,842.50')).toBeTruthy()
    expect(within(sheet).queryByText(/a day$/)).toBeNull()
  })

  it('a month that is short says so, in the card and in the math', async () => {
    await r.addTransaction({ date: '2026-11-04', amount: -300000, note: 'car' })
    goto('/home')
    render(<App />)
    const card = await region('Left to spend')
    // €842.50 + €2,100 − €3,000.
    expect(await within(card).findByText('€57.50')).toBeTruthy()
    expect(within(card).getByText('short')).toBeTruthy()
    await userEvent.click(within(card).getByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    expect(within(sheet).getByText('Short this period')).toBeTruthy()
  })

  it('a past month that ran short says so, in the card and in the math', async () => {
    await r.addTransaction({ date: '2026-10-10', amount: -250000, note: 'car' })
    goto('/home')
    render(<App />)
    const nav = await months()
    await userEvent.click(within(nav).getByRole('button', { name: 'Previous month' }))
    expect(await within(nav).findByText('October 2026')).toBeTruthy()
    const card = await region('Left to spend')
    // €2,100 in, €2,500 out.
    expect(await within(card).findByText('€400.00')).toBeTruthy()
    expect(within(card).getByText('ran short')).toBeTruthy()
    expect(verdict(await region('Income vs spending'))).toBe('€400.00 more went out than came in.')
    await userEvent.click(within(card).getByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    expect(within(sheet).getByText('Ran short this period')).toBeTruthy()
  })

  it('has an open notes box for this month under its own heading', async () => {
    goto('/home')
    render(<App />)
    const notes = await region('Notes for this month')
    const box = await within(notes).findByRole('textbox', { name: 'Notes for this month' })
    expect(box.getAttribute('placeholder')).toMatch(/^Anything to remember this month\?/)
    expect(within(notes).getByRole('button', { name: 'Save' })).toBeTruthy()
  })

  it('without envelopes there is no budget chart, but the rest is there', async () => {
    await r.updateSettings({ envelopesEnabled: false })
    await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'lunch' })
    goto('/home')
    render(<App />)
    const list = await screen.findByRole('list', { name: 'Spending distribution' })
    expect(within(list).getByText('Spending')).toBeTruthy()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Budget vs\. actuals/ })).toBeNull(),
    )
    expect(screen.getByRole('region', { name: 'Left to spend' })).toBeTruthy()
  })

  describe('by pay period, with irregular pay', () => {
    async function irregular(expected: string[]) {
      await r.updateSettings({ planBy: 'payday' })
      const [salary] = await r.listIncomes()
      await r.updateIncome(salary!.id, { schedule: { kind: 'irregular', expected } })
    }

    it('steps between real pay periods only, never one day at a time or into nothing', async () => {
      await irregular(['2026-11-20', '2026-12-04'])
      goto('/home')
      render(<App />)
      const nav = await screen.findByRole('navigation', { name: 'Pay periods' })
      const prev = within(nav).getByRole('button', { name: 'Previous pay period' })
      const next = within(nav).getByRole('button', { name: 'Next pay period' })
      const label = nav.querySelector('p')!
      const now = label.textContent
      // Before the first payday there is no earlier period.
      expect(off(prev)).toBe(true)
      expect(off(next)).toBe(false)

      await userEvent.click(next)
      await waitFor(() => expect(label.textContent).not.toBe(now))
      // No payday after 4 Dec: nowhere further to go, and pressing it changes nothing.
      expect(off(next)).toBe(true)
      expect(off(prev)).toBe(false)
      const later = label.textContent
      await userEvent.click(next)
      expect(label.textContent).toBe(later)
      expect(await region('Income vs spending')).toBeTruthy()

      await userEvent.click(prev)
      await waitFor(() => expect(label.textContent).toBe(now))
      expect(off(prev)).toBe(true)
    })

    it('keeps the screen when the period being looked at goes away, with a way back', async () => {
      await irregular(['2026-11-20', '2026-12-04'])
      goto('/home')
      render(<App />)
      const nav = await screen.findByRole('navigation', { name: 'Pay periods' })
      const now = nav.querySelector('p')!.textContent
      await userEvent.click(within(nav).getByRole('button', { name: 'Next pay period' }))
      await waitFor(() => expect(nav.querySelector('p')!.textContent).not.toBe(now))

      // The 4 Dec payday is removed: 20 Nov no longer starts a pay period.
      const [salary] = await r.listIncomes()
      await r.updateIncome(salary!.id, {
        schedule: { kind: 'irregular', expected: ['2026-11-20'] },
      })
      expect(await within(nav).findByText('No pay period here')).toBeTruthy()
      expect(screen.queryByRole('heading', { name: 'Add your payday first' })).toBeNull()

      await userEvent.click(within(nav).getByRole('button', { name: 'Now' }))
      await waitFor(() => expect(nav.querySelector('p')!.textContent).toBe(now))
      expect(document.activeElement).toBe(nav.querySelector('p'))
      expect(await region('Income vs spending')).toBeTruthy()
    })
  })
})
