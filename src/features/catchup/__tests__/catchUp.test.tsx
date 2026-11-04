// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import type { Recurrence } from '../../../domain/types'

// Fri 20 Nov 2026, planning by month.
const NOW = new Date(2026, 10, 20, 12, 0)

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

describe('time away', () => {
  // Safe to spend is pay-based (money in − bills − spending), so there is no bank balance
  // to re-enter after a break: Today opens as usual, and bills missed while away are at
  // the top of Coming up with a box to tick.
  it('after three weeks away, Today opens as usual and lists the missed bill to tick', async () => {
    await r.updateSettings({ startDate: '2026-10-01', startingBalance: 100000 })
    await r.setMeta('lastOpened', '2026-10-25')
    const phone = await r.addBill({
      name: 'Phone',
      amount: 5000,
      rule: monthly(10),
      autopay: false,
    })
    await r.updateBill(phone.id, { createdAt: new Date(2026, 9, 25, 10).toISOString() })
    render(<App />)

    expect(await screen.findByRole('list', { name: 'At a glance' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: /Welcome back/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Balance' })).toBeNull()
    const comingUp = within(await screen.findByRole('region', { name: 'Coming up' }))
    expect(comingUp.getAllByRole('checkbox', { name: /Phone/ }).length).toBeGreaterThan(0)
  })
})

describe('backup reminder', () => {
  // Pay no longer needs a balance check-in to count (PLAN-v2 A), so the reminder is
  // the 14-day backup card rather than a payday check-in moment.
  it('asks for a backup once two weeks pass without one', async () => {
    await r.updateSettings({ startDate: '2026-11-01', startingBalance: 100000 })
    await r.addTransaction({ date: '2026-11-20', amount: -500, note: 'tea' })
    await r.setMeta('lastOpened', '2026-11-20')
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Save a backup' })).toBeTruthy()
  })
})
