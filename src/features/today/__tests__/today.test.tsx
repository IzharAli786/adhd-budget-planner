// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import type { Recurrence } from '../../../domain/types'

// Wed 4 Nov 2026. Salary on the last day (Mon 30 Nov), so 26 days to payday.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
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

/** An instant shortly before NOW, in whatever zone the test machine runs. */
const EARLIER = new Date(2026, 10, 4, 8, 0).toISOString()

/** The big number: the live region inside the hero card. */
const hero = async () =>
  (await screen.findByRole('region', { name: 'Today’s number' })).querySelector('[aria-live]')!

describe('Today', () => {
  it('starts with an empty state that names the next step', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Let’s find your number' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add your payday' }).getAttribute('href')).toBe(
      '/bills?view=paydays',
    )
  })

  it('asks for the balance once the payday is known, then shows the number', async () => {
    await salary()
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add your balance' }))
    const sheet = await screen.findByRole('dialog', { name: /in your account right now/ })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Balance' }), '842.50')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Update balance' }))
    // 84250 / 26 days = 3240.38 -> floor 3240
    expect((await hero()).textContent).toBe('€32.40')
    expect(screen.getByText(/26 days to payday · balance from today/)).toBeTruthy()
    expect(screen.getByText('€842.50')).toBeTruthy()
  })

  it('acceptance: "12 coffee" logs €12.00 and leftToday drops by exactly €12', async () => {
    await salary()
    await r.addCheckIn(84250, '2026-11-04', EARLIER)
    render(<App />)
    expect((await hero()).textContent).toBe('€32.40')

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
    await waitFor(async () => expect((await hero()).textContent).toBe('€20.40'))
    expect((field as HTMLInputElement).value).toBe('')
    expect(await screen.findByText('Logged €12.00 · coffee')).toBeTruthy()
    // ...and the one-tap chip is there for next time.
    expect(screen.getByRole('button', { name: 'Log coffee €12.00 again' })).toBeTruthy()
  })

  it('explains bad input instead of saving it', async () => {
    await salary()
    await r.addCheckIn(84250, '2026-11-04', EARLIER)
    render(<App />)
    const field = await screen.findByRole('textbox', { name: /Quick add/ })
    await userEvent.type(field, '1.250 rent{Enter}')
    expect(screen.getByText(/too many decimals/)).toBeTruthy()
    expect(await r.listTransactions()).toEqual([])
  })

  it('"See the math": 4 simple lines that sum, ending with the estimate note', async () => {
    await salary()
    await oldBill('Phone', 2500, 15, true)
    await r.addCheckIn(84250, '2026-11-04', EARLIER)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'See the math' }))
    const sheet = await screen.findByRole('dialog', { name: 'How this number works' })
    const text = sheet.textContent ?? ''
    expect(text).toContain('Balance€842.50')
    expect(text).toContain('Bills before payday-€25.00')
    expect(text).toContain('Set aside (savings, envelopes, buffer)€0.00')
    expect(text).toContain('Safe to spend until payday€817.50')
    // The note is the last thing in the math view.
    const note = within(sheet).getByText('Estimate based on what you entered.')
    expect(note.nextElementSibling).toBeNull()

    await userEvent.click(within(sheet).getByRole('radio', { name: 'Every line' }))
    expect(within(sheet).getByText('Balance when you checked in')).toBeTruthy()
    expect(within(sheet).getByText(/Phone/)).toBeTruthy()
  })

  it('a check-in marks autopay bills paid and asks once about the others', async () => {
    await salary()
    const phone = await oldBill('Phone', 2500, 2, true)
    const gym = await oldBill('Gym', 3000, 3, false)
    const rent = await oldBill('Rent', 95000, 1, false)
    await r.addCheckIn(200000, '2026-10-31', '2026-10-31T09:00:00.000Z')
    render(<App />)
    // Before: all three are still due.
    await screen.findByText('Did Rent go out?')

    await userEvent.click(screen.getByRole('button', { name: 'Update' }))
    const sheet = await screen.findByRole('dialog', { name: /in your account right now/ })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Balance' }), '1000')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Update balance' }))
    expect(await within(sheet).findByText('Did these come out yet?')).toBeTruthy()
    expect(within(sheet).getByText('1 autopay bill is marked paid automatically.')).toBeTruthy()
    // Gym hasn't gone out: one exception, then save.
    await userEvent.click(within(sheet).getByRole('button', { name: 'Gym came out' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))

    await waitFor(async () => {
      const rows = await r.listOccurrences()
      expect(rows.find((o) => o.billId === phone.id)).toMatchObject({ status: 'paid', auto: true })
      expect(rows.find((o) => o.billId === rent.id)).toMatchObject({ status: 'paid' })
      expect(rows.find((o) => o.billId === gym.id)).toBeUndefined()
    })
    // Gym stays due (and counted); it is now the one overdue bill the card asks about.
    expect(await screen.findByText('Did Gym go out?')).toBeTruthy()
    expect(await screen.findByText(/Balance updated · 2 bills marked paid/)).toBeTruthy()
  })

  it('"Not now" snoozes the action card for 24h', async () => {
    await salary()
    await oldBill('Rent', 95000, 1, false)
    await r.addCheckIn(200000, '2026-11-04', EARLIER)
    render(<App />)
    expect(await screen.findByText('Did Rent go out?')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }))
    // Next in line: nothing logged today yet.
    expect(await screen.findByText('Log today’s spending')).toBeTruthy()
    const snoozes = await r.getMeta<Record<string, string>>('snoozes')
    expect(Object.values(snoozes ?? {})).toEqual([
      new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
    ])
  })

  it('"Can this fit?" shows before and after', async () => {
    await salary()
    await r.addCheckIn(26000, '2026-11-04', EARLIER)
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Can this fit?' }))
    const sheet = await screen.findByRole('dialog', { name: 'Can this fit?' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Price' }), '60')
    expect(await within(sheet).findByText('Yes, it fits before payday.')).toBeTruthy()
    expect(sheet.textContent).toContain('€260.00 → €200.00')
    expect(sheet.textContent).toContain('€10.00 → €7.69')
    await userEvent.clear(within(sheet).getByRole('textbox', { name: 'Price' }))
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Price' }), '300')
    expect(await within(sheet).findByText('Not before payday.')).toBeTruthy()
    expect(sheet.textContent).toContain('€40.00 short')
  })

  it('a short total reads "€… short", never a minus sign', async () => {
    await salary()
    await oldBill('Rent', 95000, 20, false)
    await r.addCheckIn(50000, '2026-11-04', EARLIER)
    render(<App />)
    expect((await hero()).textContent).toBe('€450.00 short')
  })

  it('a one-off bill typed in with a past date counts as overdue, not history', async () => {
    await salary()
    await r.addCheckIn(84250, '2026-11-04', EARLIER)
    // Added today (NOW), dated two days ago: still owed.
    await r.addBill({
      name: 'Parking fine',
      amount: 4000,
      rule: { freq: 'once', date: '2026-11-02' },
      autopay: false,
    })
    render(<App />)
    expect(await screen.findByText('Did Parking fine go out?')).toBeTruthy()
    // (84250 − 4000) / 26 = 3086.5 -> floor 3086
    expect((await hero()).textContent).toBe('€30.86')
  })
})
