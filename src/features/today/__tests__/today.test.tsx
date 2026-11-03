// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import type { Recurrence } from '../../../domain/types'

// Wed 4 Nov 2026. Planning by calendar month: 27 days left in November, today included.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const salary = () =>
  r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })

const monthly = (day: number): Recurrence => ({
  freq: 'monthly',
  interval: 1,
  day,
  anchor: `2026-01-${String(day).padStart(2, '0')}`,
})

/** Bills "added" long ago, so their earlier dates count as overdue, not history. */
async function oldBill(name: string, amount: number, day: number, autopay: boolean) {
  const bill = await r.addBill({ name, amount, rule: monthly(day), autopay })
  await r.updateBill(bill.id, { createdAt: '2026-01-01T00:00:00.000Z' })
  return bill
}

/** Money basics: tracking starts on `date` with `balance` (PLAN-v2 §C). */
const start = (balance: number, date = '2026-11-04') =>
  r.updateSettings({ planBy: 'month', startDate: date, startingBalance: balance })

/** The big number: the live region inside the hero card. */
const hero = async () =>
  (await screen.findByRole('region', { name: 'Today’s number' })).querySelector('[aria-live]')!

describe('Today', () => {
  it('by payday, starts with an empty state that names the next step', async () => {
    await r.updateSettings({ planBy: 'payday' })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Let’s find your number' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add your payday' }).getAttribute('href')).toBe(
      '/bills?view=paydays',
    )
  })

  it('by month, shows a number straight away from the starting balance', async () => {
    await start(84250)
    render(<App />)
    // 84250 / 27 days = 3120.4 -> floor 3120
    expect((await hero()).textContent).toBe('€31.20')
    expect(screen.getByText(/safe to\s+spend in November/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Money basics' }).getAttribute('href')).toBe(
      '/more/basics',
    )
  })

  it('this month’s pay counts as money in (pay-based)', async () => {
    await start(0)
    await salary()
    render(<App />)
    // 210000 / 27 = 7777.7 -> 7777
    expect((await hero()).textContent).toBe('€77.77')
  })

  it('acceptance: "12 coffee" logs €12.00 and leftToday drops by exactly €12', async () => {
    await start(84250)
    render(<App />)
    expect((await hero()).textContent).toBe('€31.20')

    const field = screen.getByRole('textbox', { name: /Quick add/ })
    await userEvent.type(field, '12 coffee')
    // The preview chip says how it was read before anything is saved.
    expect(screen.getByText('Spend €12.00')).toBeTruthy()
    await userEvent.keyboard('{Enter}')

    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ amount: -1200, note: 'coffee', date: '2026-11-04' }),
      ]),
    )
    await waitFor(async () => expect((await hero()).textContent).toBe('€19.20'))
    expect((field as HTMLInputElement).value).toBe('')
    expect(await screen.findByText('Logged €12.00 · coffee')).toBeTruthy()
    // ...and the one-tap chip is there for next time.
    expect(screen.getByRole('button', { name: 'Log coffee €12.00 again' })).toBeTruthy()
  })

  it('savings and debt payments never move the number', async () => {
    await start(84250)
    const fund = await r.addFund({ name: 'Trip', perPeriod: 0, openingSaved: 10000 })
    const debt = await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: '2026-11-01',
      aprBps: 1999,
      minPayment: 2500,
      dueDay: 20,
    })
    render(<App />)
    expect((await hero()).textContent).toBe('€31.20')
    await r.addToFund(fund, 20000, '2026-11-04')
    await r.addTransaction({ date: '2026-11-04', amount: -15000, note: '', debtId: debt.debt.id })
    const overview = within(await screen.findByRole('region', { name: 'Savings and debt' }))
    // Two separate writes: wait for both totals, not just the first.
    await waitFor(() => {
      expect(overview.getByText('€300.00')).toBeTruthy()
      expect(overview.getByText('€350.00')).toBeTruthy()
    })
    expect((await hero()).textContent).toBe('€31.20')
    const tiles = within(screen.getByRole('list', { name: 'At a glance' }))
    expect(tiles.getByText('€25.00')).toBeTruthy()
  })

  it('explains bad input instead of saving it', async () => {
    await start(84250)
    render(<App />)
    const field = await screen.findByRole('textbox', { name: /Quick add/ })
    await userEvent.type(field, '1.250 rent{Enter}')
    expect(screen.getByText(/too many decimals/)).toBeTruthy()
    expect(await r.listTransactions()).toEqual([])
  })

  it('"See the math": simple lines that sum, ending with the walled-off note', async () => {
    await r.updateSettings({ simpleMode: true })
    await start(84250)
    await oldBill('Phone', 2500, 15, true)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    const text = sheet.textContent ?? ''
    expect(text).toContain('Money for this period€842.50')
    expect(text).toContain('Bills-€25.00')
    expect(text).toContain('Spending and cushion€0.00')
    expect(text).toContain('Safe to spend this period€817.50')
    expect(text).toContain('never change this number')

    await userEvent.click(within(sheet).getByRole('radio', { name: 'Every line' }))
    expect(within(sheet).getByText('Starting balance')).toBeTruthy()
    expect(within(sheet).getByText(/Phone/)).toBeTruthy()
  })

  it('"Not now" snoozes the action card for 24h', async () => {
    await start(200000, '2026-11-01')
    await oldBill('Rent', 95000, 1, false)
    render(<App />)
    expect(await screen.findByText('Did Rent go out?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    // Next in line: by month a payday is optional, so it waits behind the overdue bill.
    expect(await screen.findByText('When is your next pay?')).toBeTruthy()
    const snoozes = await r.getMeta<Record<string, string>>('snoozes')
    expect(Object.values(snoozes ?? {})).toEqual([
      new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
    ])
  })

  it('"Can this fit?" shows before and after', async () => {
    await start(26000)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Can this fit?' }))
    const sheet = await screen.findByRole('dialog', { name: 'Can this fit?' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Price' }), '60')
    expect(await within(sheet).findByText('Yes, it fits this period.')).toBeTruthy()
    expect(sheet.textContent).toContain('€260.00 → €200.00')
    expect(sheet.textContent).toContain('€9.62 → €7.40')
    await userEvent.clear(within(sheet).getByRole('textbox', { name: 'Price' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Price' }), '300')
    expect(await within(sheet).findByText('Not this period.')).toBeTruthy()
    expect(sheet.textContent).toContain('€40.00 short')
  })

  it('a short total reads "€… short", never a minus sign', async () => {
    await start(50000)
    await oldBill('Rent', 95000, 20, false)
    render(<App />)
    expect((await hero()).textContent).toBe('€450.00 short')
  })

  it('a one-off bill typed in with a past date counts and is asked about', async () => {
    await start(84250, '2026-11-01')
    // Added today (NOW), dated two days ago: still owed.
    await r.addBill({
      name: 'Parking fine',
      amount: 4000,
      rule: { freq: 'once', date: '2026-11-02' },
      autopay: false,
    })
    render(<App />)
    expect(await screen.findByText('Did Parking fine go out?')).toBeTruthy()
    // (84250 − 4000) / 27 = 2972.2 -> floor 2972
    expect((await hero()).textContent).toBe('€29.72')
  })
})

describe('Coming up', () => {
  const comingUp = async () => within(await screen.findByRole('region', { name: 'Coming up' }))

  it('lists bills and paydays in date order, with a box to tick each bill', async () => {
    await start(200000)
    await salary()
    await r.addBill({ name: 'Rent', amount: 95000, rule: monthly(20), autopay: false })
    await r.addBill({ name: 'Phone', amount: 2500, rule: monthly(8), autopay: true })
    await r.addBill({ name: 'Gym', amount: 3000, rule: monthly(12), autopay: false })
    render(<App />)
    const list = await comingUp()
    const rows = list.getAllByRole('listitem').map((li) => li.textContent)
    // The next five within 45 days: December's Phone joins after Salary.
    expect(rows).toHaveLength(5)
    expect(rows[0]).toContain('Phone')
    expect(rows[0]).toContain('Autopay')
    expect(rows[1]).toContain('Gym')
    expect(rows[2]).toContain('Rent')
    expect(rows[3]).toContain('Payday')
    expect(list.getAllByRole('checkbox')).toHaveLength(4)
    expect(list.getByRole('link', { name: /Open calendar/ }).getAttribute('href')).toBe('/bills')
  })

  it('ticking a bill marks it paid and leaves the number alone', async () => {
    await start(200000)
    const gym = await r.addBill({ name: 'Gym', amount: 3000, rule: monthly(12), autopay: false })
    render(<App />)
    const before = (await hero()).textContent
    await userEvent.click((await comingUp()).getAllByRole('checkbox', { name: /Gym/ })[0]!)
    await waitFor(async () =>
      expect((await r.listOccurrences()).find((o) => o.billId === gym.id)).toMatchObject({
        status: 'paid',
      }),
    )
    expect((await hero()).textContent).toBe(before)
  })

  it('shows a payday as money in', async () => {
    await start(200000)
    await salary()
    render(<App />)
    const row = (await comingUp()).getByRole('listitem')
    expect(row.textContent).toContain('Payday')
    expect(row.textContent).toContain('+€2,100.00')
  })

  it('stays out of Just today', async () => {
    await start(200000)
    await salary()
    render(<App />)
    await comingUp()
    await userEvent.click(screen.getByRole('button', { name: 'Just today' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Coming up' })).toBeNull())
  })
})
