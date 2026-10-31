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

describe('Goals: savings funds', () => {
  it('names the next step when empty, then adds a fund and money to it', async () => {
    render(<App />)
    expect(await screen.findByText('Start one small fund')).toBeTruthy()
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

describe('Goals: taking money out of a fund', () => {
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
})
