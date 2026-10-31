// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// The one write fails (quota, a closed DB): the welcome must say so and stay, not
// swallow the error and leave the user wondering whether anything happened.
vi.mock('../../../db/repos', async (original) => ({
  ...(await original<typeof import('../../../db/repos')>()),
  applyFreshStart: vi.fn().mockRejectedValue(new Error('QuotaExceededError')),
}))

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 12, 0))
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

describe('fresh start when saving fails', () => {
  it('says so kindly and keeps the welcome to try again', async () => {
    await r.addCheckIn(100000, '2026-10-25', new Date(2026, 9, 25, 10).toISOString())
    await r.setMeta('lastOpened', '2026-10-25')
    render(<App />)

    const card = await screen.findByRole('region', { name: /Welcome back/ })
    await userEvent.type(within(card).getByRole('textbox', { name: 'Balance' }), '500')
    await userEvent.click(within(card).getByRole('button', { name: 'Update and carry on' }))

    expect((await within(card).findByRole('alert')).textContent).toMatch(/try again/)
    expect(screen.getByRole('region', { name: /Welcome back/ })).toBeTruthy()
    expect(
      within(card).getByRole('button', { name: 'Update and carry on' }).hasAttribute('disabled'),
    ).toBe(false)
    expect(await r.getMeta('lastOpened')).toBe('2026-10-25')
  })
})
