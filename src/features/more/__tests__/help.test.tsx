// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { dismissInstallBanner, installBannerDismissed } from '../../../lib/install'

// Wed 4 Nov 2026, noon local.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const goto = (path: string) => window.history.replaceState(null, '', path)

describe('More › How each part works', () => {
  it('opens from More: a card per tab and the common questions', async () => {
    goto('/more')
    render(<App />)
    await userEvent.click(await screen.findByRole('link', { name: /How each part works/ }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'How each part works' }),
    ).toBeTruthy()
    for (const tab of ['Today', 'Bills', 'Plan', 'Goals', 'More'])
      expect(screen.getByRole('heading', { level: 2, name: tab })).toBeTruthy()
    for (const q of [/offline/, /backups/, /estimate/, /Simple or Full/, /private/])
      expect(screen.getByText(q, { selector: 'summary span' })).toBeTruthy()
    expect(screen.getByText('Estimates only, not financial advice.')).toBeTruthy()
  })
})

describe('Add your rent: one tap to the bill form', () => {
  it('/bills?new=1 opens the form, and the address drops the flag', async () => {
    goto('/bills?new=1')
    render(<App />)
    const sheet = await screen.findByRole('dialog', { name: 'Add a bill' })
    expect(within(sheet).getByRole('textbox', { name: 'Name' })).toBeTruthy()
    expect(window.location.search).toBe('')
  })

  it('Today’s "Add a bill" lands in the form', async () => {
    await r.addIncome({
      name: 'Salary',
      amount: 210000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    })
    await r.addCheckIn(84250, '2026-11-04', new Date(2026, 10, 4, 8).toISOString())
    goto('/')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add a bill' }))
    expect(await screen.findByRole('dialog', { name: 'Add a bill' })).toBeTruthy()
  })
})

describe('Goals strip', () => {
  it('shows saved, owed and the garden stage', async () => {
    await r.updateSettings({ simpleMode: false })
    await r.addFund({ name: 'Cushion', perPeriod: 0, openingSaved: 12000 })
    await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: '2026-11-04',
      aprBps: 2000,
      minPayment: 2500,
      dueDay: 12,
    })
    goto('/goals')
    render(<App />)
    const strip = await screen.findByRole('region', { name: 'Goals at a glance' })
    expect(within(strip).getByText('€120.00')).toBeTruthy()
    expect(within(strip).getByText('€500.00')).toBeTruthy()
    expect(within(strip).getByText(/Stage 1 of/)).toBeTruthy()
  })
})

describe('install banner', () => {
  it('"Not now" is remembered on this device', () => {
    expect(installBannerDismissed()).toBe(false)
    dismissInstallBanner()
    expect(installBannerDismissed()).toBe(true)
  })
})
