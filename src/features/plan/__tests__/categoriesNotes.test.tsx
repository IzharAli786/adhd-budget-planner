// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { STARTER_CATEGORIES } from '../../../domain/categories'

// Wed 4 Nov 2026, planning by month: this period started Sun 1 Nov.
const NOW = new Date(2026, 10, 4, 12, 0)
const EARLIER = new Date(2026, 10, 4, 8, 0).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false })
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

describe('Common categories', () => {
  it('are offered right after envelopes go on, added in one tap with empty budgets, and undoable', async () => {
    await r.updateSettings({ envelopesEnabled: false })
    goto('/envelopes')
    render(<App />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Use envelopes' }))
    const offer = await screen.findByRole('region', { name: 'Start with common categories?' })
    expect(within(offer).getAllByRole('listitem')).toHaveLength(10)

    await userEvent.click(
      within(offer).getByRole('button', { name: 'Start with common categories' }),
    )
    await waitFor(async () => expect(await r.listEnvelopes()).toHaveLength(11))
    const envelopes = await r.listEnvelopes()
    expect(envelopes.map((e) => e.name)).toEqual([
      'Everyday',
      ...STARTER_CATEGORIES.map((c) => c.name),
    ])
    expect(envelopes.every((e) => e.budget === 0)).toBe(true)
    expect(new Set(envelopes.map((e) => e.color)).size).toBe(11)
    expect(await screen.findByRole('heading', { name: 'Groceries' })).toBeTruthy()
    // The offer is done once there is more than Everyday.
    expect(screen.queryByRole('region', { name: 'Start with common categories?' })).toBeNull()

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await r.listEnvelopes()).toHaveLength(1))
  })

  it('can be skipped, and stays skipped', async () => {
    await r.updateSettings({ envelopesEnabled: false })
    goto('/envelopes')
    const { unmount } = render(<App />)
    await userEvent.click(await screen.findByRole('switch', { name: 'Use envelopes' }))
    await userEvent.click(await screen.findByRole('button', { name: 'I’ll make my own' }))
    expect(screen.queryByRole('region', { name: 'Start with common categories?' })).toBeNull()
    unmount()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Everyday' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Start with common categories?' })).toBeNull()
    expect(await r.listEnvelopes()).toHaveLength(1)
  })

  it('a new envelope gets its own colour, and the colour can be changed', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    goto('/envelopes')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add envelope' }))
    const sheet = await screen.findByRole('dialog', { name: 'New envelope' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Pets')
    expect(within(sheet).getByRole('radio', { name: 'Clay' })).toHaveProperty('checked', true)
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Teal' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add envelope' }))
    await waitFor(async () =>
      expect((await r.listEnvelopes()).find((e) => e.name === 'Pets')?.color).toBe('teal'),
    )
  })

  it('“Track spending” shows them as chips, and the tagged entry lands in that envelope', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    await r.addStarterEnvelopes()
    goto('/envelopes')
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Quick add' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '12')
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'What for (optional)' }),
      'lunch',
    )
    const chips = within(sheet).getByRole('group', { name: 'Envelope' })
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Everyday', ...STARTER_CATEGORIES.map((c) => c.name)])
    await userEvent.click(within(chips).getByRole('button', { name: 'Eating out' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))
    await waitFor(async () => {
      const [tx] = await r.listTransactions()
      const env = (await r.listEnvelopes()).find((e) => e.name === 'Eating out')
      expect(tx).toMatchObject({ amount: -1200, note: 'lunch', envelopeId: env!.id })
    })
    const card = screen.getByRole('region', { name: 'Eating out' })
    expect(await within(card).findByText('lunch')).toBeTruthy()
    expect(within(card).getByText('€12.00 spent')).toBeTruthy()
  })
})

describe('Note for this month', () => {
  it('is written on Home and is still there next time', async () => {
    goto('/home')
    const { unmount } = render(<App />)
    const card = await screen.findByRole('region', { name: 'Note for this month' })
    await userEvent.click(await within(card).findByRole('button', { name: 'Add a note' }))
    await userEvent.type(within(card).getByRole('textbox'), '  Birthday month, go easy  ')
    await userEvent.click(within(card).getByRole('button', { name: 'Save note' }))
    await waitFor(async () =>
      expect(await r.getNote({ periodStart: '2026-11-01' })).toMatchObject({
        id: 'period|2026-11-01',
        text: 'Birthday month, go easy',
      }),
    )
    expect(await within(card).findByText('Birthday month, go easy')).toBeTruthy()
    unmount()

    goto('/home')
    render(<App />)
    const again = await screen.findByRole('region', { name: 'Note for this month' })
    expect(await within(again).findByText('Birthday month, go easy')).toBeTruthy()
  })

  it('belongs to its own month: October’s is separate', async () => {
    await r.saveNote({ periodStart: '2026-11-01' }, 'November only')
    goto('/home')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Note for this month' })
    expect(await within(card).findByText('November only')).toBeTruthy()
    const nav = screen.getByRole('navigation', { name: 'Months' })
    await userEvent.click(within(nav).getByRole('button', { name: 'Previous month' }))
    expect(await within(nav).findByText('October 2026')).toBeTruthy()
    const october = await screen.findByRole('region', { name: 'Note for this month' })
    expect(await within(october).findByRole('button', { name: 'Add a note' })).toBeTruthy()
    expect(screen.queryByText('November only')).toBeNull()
  })

  it('editing to blank removes it, with undo', async () => {
    await r.saveNote({ periodStart: '2026-11-01' }, 'old note')
    goto('/home')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Note for this month' })
    await userEvent.click(
      await within(card).findByRole('button', { name: 'Edit Note for this month' }),
    )
    await userEvent.click(within(card).getByRole('button', { name: 'Remove' }))
    await waitFor(async () =>
      expect(await r.getNote({ periodStart: '2026-11-01' })).toBeUndefined(),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () =>
      expect((await r.getNote({ periodStart: '2026-11-01' }))?.text).toBe('old note'),
    )
  })
})
