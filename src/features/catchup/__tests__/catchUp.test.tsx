// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import type { Recurrence } from '../../../domain/types'

// Fri 20 Nov 2026. Salary on the last day; Oct 31 is a Saturday, so the period began Fri 30 Oct.
const NOW = new Date(2026, 10, 20, 12, 0)
const local = (m: number, d: number, h = 10) => new Date(2026, m - 1, d, h).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  await r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const monthly = (day: number): Recurrence => ({
  freq: 'monthly',
  interval: 1,
  day,
  anchor: `2026-01-${String(day).padStart(2, '0')}`,
})

async function bill(name: string, day: number, autopay: boolean, addedAt: string) {
  const b = await r.addBill({ name, amount: 5000, rule: monthly(day), autopay })
  await r.updateBill(b.id, { createdAt: addedAt })
  return b
}

const hero = async () =>
  (await screen.findByRole('region', { name: 'Today’s number' })).querySelector('[aria-live]')!

describe('fresh start after three weeks away', () => {
  async function awayThreeWeeks() {
    await r.addCheckIn(100000, '2026-10-25', local(10, 25))
    await r.setMeta('lastOpened', '2026-10-25')
    const rent = await bill('Rent', 1, true, local(10, 25)) // Nov 1, autopay
    const phone = await bill('Phone', 10, false, local(10, 25)) // Nov 10, manual
    const lamp = await r.addImpulse({ name: 'Lamp', amount: 4000 }, local(10, 26))
    return { rent, phone, lamp }
  }

  it('takes one number, settles the gap in counts, and returns to Today', async () => {
    const { rent, phone, lamp } = await awayThreeWeeks()
    render(<App />)

    const card = await screen.findByRole('region', {
      name: 'Welcome back. Let’s just update one number.',
    })
    expect(within(card).getByText('1 autopay bill will be marked paid')).toBeTruthy()
    expect(within(card).getByText('1 other bill will be marked paid')).toBeTruthy()
    expect(within(card).getByText('1 item from your 48h list will be tucked away')).toBeTruthy()
    // Counts, never a list: the bill names stay out of sight unless asked for.
    expect(within(card).queryByText('Phone')).toBeNull()
    expect(screen.getAllByRole('textbox')).toHaveLength(1)

    await userEvent.type(within(card).getByRole('textbox', { name: 'Balance' }), '500')
    await userEvent.click(within(card).getByRole('button', { name: 'Update and carry on' }))

    await hero()
    expect((await r.latestCheckIn())?.balance).toBe(50000)
    expect((await r.listOccurrences(rent.id))[0]).toMatchObject({ status: 'paid', auto: true })
    expect((await r.listOccurrences(phone.id))[0]?.status).toBe('paid')
    expect((await r.listImpulse()).find((i) => i.id === lamp.id)?.decision).toBe('archived')
    await waitFor(async () => expect(await r.getMeta('lastOpened')).toBe('2026-11-20'))
    // No invented transactions: the gap is absorbed by the balance.
    expect(await r.listTransactions()).toEqual([])
  })

  it('lets the user keep a bill unpaid as an exception', async () => {
    const { phone } = await awayThreeWeeks()
    render(<App />)
    const card = await screen.findByRole('region', { name: /Welcome back/ })
    await userEvent.click(within(card).getByRole('button', { name: 'Some didn’t go out?' }))
    await userEvent.click(within(card).getByRole('button', { name: 'Phone paid' }))
    expect(within(card).getByText('0 of 1 other bills will be marked paid')).toBeTruthy()
    await userEvent.type(within(card).getByRole('textbox', { name: 'Balance' }), '500')
    await userEvent.click(within(card).getByRole('button', { name: 'Update and carry on' }))
    await hero()
    expect(await r.listOccurrences(phone.id)).toEqual([])
  })

  it('"Not now" steps aside without changing any data', async () => {
    await awayThreeWeeks()
    render(<App />)
    const card = await screen.findByRole('region', { name: /Welcome back/ })
    await userEvent.click(within(card).getByRole('button', { name: 'Not now' }))
    await hero()
    expect((await r.latestCheckIn())?.balance).toBe(100000)
    await waitFor(async () => expect(await r.getMeta('lastOpened')).toBe('2026-11-20'))
  })
})

describe('short gap', () => {
  it('shows one summary card with counts, then gets out of the way', async () => {
    await r.addCheckIn(100000, '2026-11-17', local(11, 17))
    await r.setMeta('lastOpened', '2026-11-17')
    await bill('Phone', 18, false, local(1, 1))
    render(<App />)

    const card = await screen.findByRole('region', { name: 'Welcome back' })
    expect(within(card).getByText('1 bill came due')).toBeTruthy()
    await waitFor(async () => expect(await r.getMeta('lastOpened')).toBe('2026-11-20'))

    await userEvent.click(within(card).getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Welcome back' })).toBeNull())
    // The overdue bill is still one tap away on the action card.
    expect(screen.getByRole('heading', { name: 'Did Phone go out?' })).toBeTruthy()
  })
})

describe('payday backup moment', () => {
  it('offers a one-tap backup right after the payday check-in', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { canShare: () => true, share })
    await r.addCheckIn(100000, '2026-10-29', local(10, 29))
    await r.setMeta('lastOpened', '2026-11-20')
    render(<App />)

    const payday = await screen.findByRole('region', { name: 'Payday! Update your balance' })
    await userEvent.click(within(payday).getByRole('button', { name: 'Update' }))
    const sheet = await screen.findByRole('dialog', { name: /in your account right now/ })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Balance' }), '2100')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Update balance' }))

    const moment = await screen.findByRole('dialog', { name: 'Payday done. Save a backup?' })
    const save = await within(moment).findByRole('button', { name: 'Save backup' })
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false))
    await userEvent.click(save)

    expect(share).toHaveBeenCalledTimes(1)
    const [{ files }] = share.mock.calls[0] as [{ files: File[] }]
    expect(files[0]!.name).toBe('steady-backup-2026-11-20.json')
    await waitFor(async () => expect(await r.getMeta('lastBackupAt')).toBeTruthy())
    expect(await r.getChangesSinceBackup()).toBe(0)
    delete (navigator as Partial<Navigator>).canShare
    delete (navigator as Partial<Navigator>).share
  })
})
