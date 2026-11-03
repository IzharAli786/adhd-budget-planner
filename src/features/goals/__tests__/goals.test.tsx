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
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false })
  localStorage.clear()
  window.history.replaceState(null, '', '/goals')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Goals: the bigger picture', () => {
  it('starts with life goals, then no-spend days, the 48-hour list and the garden', async () => {
    await r.addFund({ name: 'Cushion', perPeriod: 0, openingSaved: 12000 })
    await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: '2026-11-04',
      aprBps: 2000,
      minPayment: 2500,
      dueDay: 12,
    })
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Goals' })).toBeTruthy()
    await screen.findByRole('heading', { name: 'A seed' })
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(order).toEqual(['Life goals', 'No-spend days', '48-hour list', 'A seed'])
    // Savings funds and debts have their own sections now.
    expect(screen.queryByRole('button', { name: 'Add money' })).toBeNull()
    expect(screen.queryByRole('list', { name: 'Payoff order' })).toBeNull()
    expect(screen.queryByText('Cushion')).toBeNull()
  })

  it('the strip sums up life goals, no-spend days and the garden', async () => {
    await r.addLifeGoal({ title: 'A week in Lisbon', status: 'doing' })
    await r.addLifeGoal({ title: 'Debt-free', status: 'done' })
    await r.addLifeGoal({ title: 'A new bike', status: 'todo' })
    await r.toggleNoSpend('2026-11-02')
    await r.toggleNoSpend('2026-10-30')
    render(<App />)
    const strip = await screen.findByRole('region', { name: 'Goals at a glance' })
    expect(await within(strip).findByText('1 of 3 done')).toBeTruthy()
    expect(within(strip).getByText('1 in progress')).toBeTruthy()
    // Only this month's no-spend days count.
    expect(within(strip).getByText('1')).toBeTruthy()
    expect(within(strip).getByText(/Stage \d of/)).toBeTruthy()
  })
})

describe('Goals: 48-hour list (clock injected)', () => {
  it('counts down, then asks "Still want it?" at 48 hours', async () => {
    await r.addImpulse({ name: 'Headphones', amount: 8900 }, hoursAgo(47))
    render(<App />)
    expect(await screen.findByText('1 h left')).toBeTruthy()
    expect(screen.queryByText(/Still want/)).toBeNull()
    cleanup()

    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Still want it?' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Skip it' }))
    expect(
      await screen.findByText(
        (_, el) => el?.textContent === '€89.00 saved by waiting.' && el.tagName === 'P',
      ),
    ).toBeTruthy()
    expect((await db.impulse.toArray())[0]!.decision).toBe('skipped')
  })

  it('decides expired items together in one tap', async () => {
    await r.addImpulse({ name: 'Shoes', amount: 6000 }, hoursAgo(80))
    await r.addImpulse({ name: 'Lamp', amount: 3000 }, hoursAgo(50))
    await r.addImpulse({ name: 'Book', amount: 1500 }, hoursAgo(2))
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Skip all 2' }))
    await waitFor(async () =>
      expect((await db.impulse.toArray()).filter((i) => i.decision === 'skipped')).toHaveLength(2),
    )
    expect(await screen.findByText('€90.00')).toBeTruthy()
    // The one still waiting is untouched.
    expect(screen.getByText('Book')).toBeTruthy()
  })

  it('"Later" waits another 48 hours', async () => {
    await r.addImpulse({ name: 'Lamp', amount: 3000 }, hoursAgo(50))
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Later' }))
    expect(await screen.findByText('2 days left')).toBeTruthy()
  })
})

describe('Goals: no-spend days and garden', () => {
  it('marks today, shows a gentle count, and the garden grows from outcomes', async () => {
    await r.addCheckIn(10000, '2026-11-01')
    await r.addCheckIn(12000, '2026-11-02')
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'A seed' })).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Mark today as no-spend' }))
    expect(await screen.findByText(/1 this month/)).toBeTruthy()
    // 2 check-in days + 1 no-spend day = 3 points: a sprout.
    expect(await screen.findByRole('heading', { name: 'A sprout' })).toBeTruthy()
    expect(await r.getMeta('gardenPoints')).toBe(3)

    // Undoing the mark never shrinks the garden.
    await userEvent.click(screen.getByRole('button', { name: 'Today is a no-spend day' }))
    expect(await screen.findByText(/A day without spending is a small win/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'A sprout' })).toBeTruthy()
  })

  it('a day with spending logged is not offered as a no-spend day, and earns no points', async () => {
    await r.addTransaction({ date: '2026-11-04', amount: -1200, note: 'lunch' })
    await r.addTransaction({ date: '2026-11-03', amount: -5000, note: 'Holiday', fundId: 'f' })
    render(<App />)
    expect(await screen.findByText(/Today has spending logged/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark today as no-spend' })).toBeNull()
    const todayBox = screen.getByRole('button', {
      name: /(4 November|November 4), spending logged/,
    })
    expect((todayBox as HTMLButtonElement).disabled).toBe(true)
    // Moving money into savings isn't spending: yesterday can still be marked.
    await userEvent.click(
      screen.getByRole('button', { name: /^Tuesday,? (3 November|November 3)$/ }),
    )
    expect(await screen.findByText(/1 this month/)).toBeTruthy()
  })
})
