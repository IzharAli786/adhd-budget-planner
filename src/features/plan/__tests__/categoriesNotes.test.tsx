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
    goto('/plan')
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
    goto('/plan')
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
    goto('/plan')
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

  it('quick-add shows them as chips after @, and a tap writes the tag', async () => {
    await r.updateSettings({ envelopesEnabled: true })
    await r.ensureDefaultEnvelope()
    await r.addStarterEnvelopes()
    goto('/')
    render(<App />)
    const field = await screen.findByRole('textbox', { name: /Quick add/ })
    await userEvent.type(field, '12 lunch @ea')
    const chips = await screen.findByRole('group', { name: 'Envelopes' })
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Eating out'])
    await userEvent.click(within(chips).getByRole('button', { name: 'Tag Eating out' }))
    expect((field as HTMLInputElement).value).toBe('12 lunch @eating ')
    expect(screen.getByText('· Eating out')).toBeTruthy()

    await userEvent.type(field, '{Enter}')
    await waitFor(async () => {
      const [tx] = await r.listTransactions()
      const env = (await r.listEnvelopes()).find((e) => e.name === 'Eating out')
      expect(tx).toMatchObject({ amount: -1200, note: 'lunch', envelopeId: env!.id })
    })
  })
})

describe('Note for this month', () => {
  it('is written on Plan and shows on Today in Full mode', async () => {
    goto('/plan')
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

    goto('/')
    render(<App />)
    const today = await screen.findByRole('region', { name: 'Note for this month' })
    expect(await within(today).findByText('Birthday month, go easy')).toBeTruthy()
  })

  it('is not on Today in Simple mode', async () => {
    await r.updateSettings({ simpleMode: true })
    await r.saveNote({ periodStart: '2026-11-01' }, 'hidden in simple')
    goto('/')
    render(<App />)
    expect(await screen.findByRole('region', { name: 'Today’s number' })).toBeTruthy()
    expect(screen.queryByText('hidden in simple')).toBeNull()
  })

  it('editing to blank removes it, with undo', async () => {
    await r.saveNote({ periodStart: '2026-11-01' }, 'old note')
    goto('/plan')
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
