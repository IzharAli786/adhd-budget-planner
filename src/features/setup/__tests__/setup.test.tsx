// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { exportBackup } from '../../../db/backup'
import { db } from '../../../db/schema'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0)) // Sat 31 Oct 2026
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('en-GB')
  await resetDb()
  await db.meta.put({ key: 'unlocked', value: { at: '2026-10-31T09:00:00.000Z', hashPrefix: 't' } })
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const heading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name })
const click = async (name: string | RegExp) =>
  userEvent.click(await screen.findByRole('button', { name }))

async function throughPayday() {
  await heading('Before we start')
  await click('I understand')
  await heading('When do you next get paid?')
  await click('Fri 6 Nov')
  await click('Continue')
  await heading('How often, and how much?')
}

describe('first-run setup (PLAN §5)', () => {
  it('redirects to /setup after unlock and finishes on Today with a number', async () => {
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/setup'))
    expect(screen.getByRole('list', { name: 'Step 1 of 4' })).toBeTruthy()
    await throughPayday()

    await userEvent.click(screen.getByRole('radio', { name: 'Every 2 weeks' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'How much lands each time?' }), '950')
    await click('Continue')

    await heading('What’s in your account right now?')
    await userEvent.type(screen.getByRole('textbox', { name: 'Balance today' }), '842.50')
    await click('Show my number')

    await screen.findByRole('navigation', { name: 'Main' })
    expect(window.location.pathname).toBe('/')
    expect(await r.listIncomes()).toEqual([
      expect.objectContaining({
        name: 'Pay',
        amount: 95000,
        schedule: { kind: 'biweekly', anchor: '2026-11-06' },
        primary: true,
        active: true,
      }),
    ])
    expect(await r.listCheckIns()).toEqual([
      expect.objectContaining({ date: '2026-10-31', balance: 84250 }),
    ])
  })

  it('detects locale and currency from the device, shown as one editable line', async () => {
    render(<App />)
    await throughPayday()
    expect(await screen.findByText(/British Pound \(£\) · British English/)).toBeTruthy()
    expect(await r.getSettings()).toMatchObject({ locale: 'en-GB', currency: 'GBP' })

    await click('Change')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'EUR')
    await waitFor(async () => expect((await r.getSettings()).currency).toBe('EUR'))
  })

  it('resumes on the same question after a reload', async () => {
    const first = render(<App />)
    await throughPayday()
    first.unmount()

    render(<App />)
    await heading('How often, and how much?')
    expect(screen.getByText(/next pay is Friday 6 November/)).toBeTruthy()
  })

  it('goes back without losing the answer, and never back to the acknowledgement', async () => {
    render(<App />)
    await throughPayday()
    await click('Back')
    await heading('When do you next get paid?')
    expect(screen.getByRole('button', { name: 'Fri 6 Nov' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('Enter advances, and asks again when the answer is missing', async () => {
    render(<App />)
    await heading('Before we start')
    await click('I understand')
    await heading('When do you next get paid?')
    await click('Continue')
    expect(await screen.findByText('Pick the date of your next payday.')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Or pick the date'), '2026-11-27{Enter}')
    await heading('How often, and how much?')
  })

  it('a double tap on the last step creates one income and one check-in', async () => {
    render(<App />)
    await throughPayday()
    await userEvent.type(screen.getByRole('textbox', { name: 'How much lands each time?' }), '2100')
    await click('Continue')
    await heading('What’s in your account right now?')
    await userEvent.type(screen.getByRole('textbox', { name: 'Balance today' }), '50')
    await userEvent.click(screen.getByRole('switch', { name: 'I’m overdrawn' }))
    const finish = screen.getByRole('button', { name: 'Show my number' })
    await userEvent.dblClick(finish)

    await screen.findByRole('navigation', { name: 'Main' })
    expect(await r.listIncomes()).toHaveLength(1)
    expect(await r.listCheckIns()).toEqual([expect.objectContaining({ balance: -5000 })])
  })

  it('can start from a backup file instead of answering', async () => {
    // A backup from another device: one income, made by the repos so it is valid.
    await r.addIncome({
      name: 'Salary',
      amount: 300000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    })
    const file = JSON.stringify(await exportBackup())
    await resetDb()
    await db.meta.put({
      key: 'unlocked',
      value: { at: '2026-10-31T09:00:00.000Z', hashPrefix: 't' },
    })

    render(<App />)
    await heading('Before we start')
    await click('I understand')
    await heading('When do you next get paid?')
    await userEvent.upload(
      screen.getByLabelText('Backup or demo file'),
      new File([file], 'steady-backup.json', { type: 'application/json' }),
    )
    await screen.findByRole('dialog', { name: 'Start from this file?' })
    await click('Use this file')

    await screen.findByRole('navigation', { name: 'Main' })
    expect((await r.listIncomes()).map((i) => i.name)).toEqual(['Salary'])
    expect(await r.getMeta('unlocked')).toBeTruthy() // the device's unlock is kept
  })

  it('does not take today as the next payday (it already starts the new period)', async () => {
    render(<App />)
    await heading('Before we start')
    await click('I understand')
    await heading('When do you next get paid?')
    expect(screen.queryByRole('button', { name: 'Sat 31 Oct' })).toBeNull() // not suggested
    await userEvent.type(screen.getByLabelText('Or pick the date'), '2026-10-31{Enter}')
    expect(await screen.findByText(/Paid today\? Then pick the payday after this one/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('When do you next get paid?')
  })

  it('asks again when how often and the next payday disagree', async () => {
    render(<App />)
    await heading('Before we start')
    await click('I understand')
    await heading('When do you next get paid?')
    await userEvent.type(screen.getByLabelText('Or pick the date'), '2026-11-20{Enter}')
    await heading('How often, and how much?')
    await userEvent.click(screen.getByRole('radio', { name: 'Every week' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'How much lands each time?' }), '400')
    await click('Continue')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/payday before the date you picked/)).toBeTruthy()
    expect((await r.getSetupProgress())?.step).toBe('pay')

    // Twice a month: the prefilled other payday already fits (not the 5th, before the 20th).
    await userEvent.click(screen.getByRole('radio', { name: 'Twice a month' }))
    expect(
      (screen.getByRole('combobox', { name: 'My other payday' }) as HTMLSelectElement).value,
    ).toBe('last')
    await click('Continue')
    await heading('What’s in your account right now?')
  })

  it('keeps the typed pay when the currency changes decimals', async () => {
    render(<App />)
    await throughPayday()
    await userEvent.type(screen.getByRole('textbox', { name: 'How much lands each time?' }), '2500')
    await click('Change')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Currency' }), 'JPY')
    await waitFor(() =>
      expect(
        (screen.getByRole('textbox', { name: 'How much lands each time?' }) as HTMLInputElement)
          .value,
      ).toBe('2500'),
    )
    await click('Continue')
    await heading('What’s in your account right now?')
    expect((await r.getSetupProgress())?.amount).toBe(2500) // 2500 yen, not 250000
  })

  it('asks for the payday again when setup is resumed after it passed', async () => {
    await r.saveSetupProgress({
      step: 'balance',
      ackAt: '2026-10-20T09:00:00.000Z',
      nextPayday: '2026-10-30',
      kind: 'monthly',
      amount: 200000,
    })
    render(<App />)
    await heading('When do you next get paid?')
  })

  it('records an overdrawn balance of zero as 0, not -0', async () => {
    render(<App />)
    await throughPayday()
    await userEvent.type(screen.getByRole('textbox', { name: 'How much lands each time?' }), '900')
    await click('Continue')
    await heading('What’s in your account right now?')
    await userEvent.type(screen.getByRole('textbox', { name: 'Balance today' }), '0')
    await userEvent.click(screen.getByRole('switch', { name: 'I’m overdrawn' }))
    await click('Show my number')
    await screen.findByRole('navigation', { name: 'Main' })
    expect(Object.is((await r.listCheckIns())[0]!.balance, 0)).toBe(true)
  })

  it('a finished setup sends /setup back to Today', async () => {
    await r.saveSetupProgress({ step: 'done' })
    window.history.replaceState(null, '', '/setup')
    render(<App />)
    await screen.findByRole('navigation', { name: 'Main' })
    expect(window.location.pathname).toBe('/')
  })
})
