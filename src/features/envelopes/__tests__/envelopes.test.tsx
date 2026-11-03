// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { budgetFor } from '../../../domain/categories'
import type { Envelope } from '../../../domain/types'

// Wed 4 Nov 2026, planning by month. The €2,100 salary lands on Mon 30 Nov.
const NOW = new Date(2026, 10, 4, 12, 0)
const EARLIER = new Date(2026, 10, 4, 8, 0).toISOString()

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false, envelopesEnabled: true })
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

/** Everyday, Food (€100 budget, €25 spent on "shop") and Fun (€50 budget, €75 on "gig"). */
async function seedEnvelopes() {
  await r.ensureDefaultEnvelope()
  const food = await r.addEnvelope({ name: 'Food', budget: 10000, color: 'sage' })
  const fun = await r.addEnvelope({ name: 'Fun', budget: 5000, color: 'plum' })
  await r.addTransaction({ date: '2026-11-02', amount: -2500, note: 'shop', envelopeId: food.id })
  await r.addTransaction({ date: '2026-11-04', amount: -7500, note: 'gig', envelopeId: fun.id })
  return { food, fun }
}

const envelope = async (name: string) =>
  (await r.listEnvelopes()).find((e) => e.name === name) as Envelope

async function open() {
  goto('/envelopes')
  render(<App />)
  return screen.findByRole('tablist', { name: 'Months' })
}

describe('Envelopes', () => {
  it('has twelve month tabs for this year with November chosen, then the yearly review', async () => {
    const tabs = await open()
    const all = within(tabs).getAllByRole('tab')
    // Named in full for screen readers; the visible label is the locale's short name.
    expect(all.map((t) => t.querySelector('.sr-only')?.textContent)).toEqual([
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ])
    expect(all.map((t) => t.querySelector('[aria-hidden]')?.textContent)).toContain('Nov')
    const nov = within(tabs).getByRole('tab', { name: 'November' })
    expect(nov.getAttribute('aria-selected')).toBe('true')
    expect(nov.getAttribute('aria-current')).toBe('date')
    expect(all.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(screen.getByRole('tabpanel', { name: 'November' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Year' }).getAttribute('href')).toBe('/review')

    // Arrow keys move between months; everything below follows.
    await seedEnvelopes()
    nov.focus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(within(tabs).getByRole('tab', { name: 'October' }).getAttribute('aria-selected')).toBe(
      'true',
    )
    const food = await screen.findByRole('region', { name: 'Food' })
    expect(within(food).getByRole('textbox', { name: 'Budget for October' })).toBeTruthy()
    expect(window.location.search).toBe('?month=2026-10')
  })

  it('the Income card lists the salary payday and adds income for the month', async () => {
    await open()
    const income = await screen.findByRole('region', { name: 'Income' })
    expect(within(income).getByText('Money in for November')).toBeTruthy()
    const rows = await within(income).findByRole('list', { name: 'Income in November' })
    expect(within(rows).getByText('Salary')).toBeTruthy()
    expect(within(rows).getByText('Payday')).toBeTruthy()
    expect(within(rows).getByText('+€2,100.00')).toBeTruthy()
    expect(within(income).getAllByText('€2,100.00')).toHaveLength(1)

    await userEvent.click(within(income).getByRole('button', { name: 'Add income' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add to this day' })
    expect(within(sheet).getByRole('button', { name: 'Income' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '40')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'What for' }), 'Gift')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ date: '2026-11-04', amount: 4000, note: 'Gift' }),
      ]),
    )
    expect(await within(income).findByText('€2,140.00')).toBeTruthy()
    expect(within(income).getByRole('button', { name: 'Edit Gift' })).toBeTruthy()
  })

  it('adds an envelope with a budget for the month and a colour', async () => {
    await r.ensureDefaultEnvelope()
    await open()
    await userEvent.click(await screen.findByRole('button', { name: 'Add envelope' }))
    const sheet = await screen.findByRole('dialog', { name: 'New envelope' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Name' }), 'Pets')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Budget for November' }), '40')
    await userEvent.click(within(sheet).getByRole('radio', { name: 'Teal' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add envelope' }))
    await waitFor(async () =>
      expect(await envelope('Pets')).toMatchObject({ budget: 4000, color: 'teal' }),
    )
    const card = await screen.findByRole('region', { name: 'Pets' })
    expect(
      (within(card).getByRole('textbox', { name: 'Budget for November' }) as HTMLInputElement)
        .value,
    ).toBe('40')
    expect(within(card).getByText('€40.00 left')).toBeTruthy()
  })

  it('“Budget for November” sets November on and leaves October as it was, with undo', async () => {
    await seedEnvelopes()
    await open()
    const food = await screen.findByRole('region', { name: 'Food' })
    const field = within(food).getByRole('textbox', { name: 'Budget for November' })
    expect((field as HTMLInputElement).value).toBe('100')
    await userEvent.clear(field)
    await userEvent.type(field, '150{Enter}')
    await waitFor(async () => expect(budgetFor(await envelope('Food'), '2026-11-01')).toBe(15000))
    const saved = await envelope('Food')
    expect(budgetFor(saved, '2026-10-01')).toBe(10000)
    expect(budgetFor(saved, '2026-12-01')).toBe(15000)
    expect(await within(food).findByText('€125.00 left')).toBeTruthy()

    await userEvent.click(
      within(screen.getByRole('tablist', { name: 'Months' })).getByRole('tab', {
        name: 'October',
      }),
    )
    const october = await screen.findByRole('region', { name: 'Food' })
    expect(
      (within(october).getByRole('textbox', { name: 'Budget for October' }) as HTMLInputElement)
        .value,
    ).toBe('100')

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(budgetFor(await envelope('Food'), '2026-11-01')).toBe(10000))
  })

  it('shows spent and left (or over) under each bar, bills linked to it included', async () => {
    const { food } = await seedEnvelopes()
    await r.addBill({
      name: 'Veg box',
      amount: 2000,
      rule: { freq: 'monthly', interval: 1, day: 20, anchor: '2026-11-20' },
      autopay: false,
      envelopeId: food.id,
    })
    await open()
    const foodCard = await screen.findByRole('region', { name: 'Food' })
    expect(within(foodCard).getByText('€45.00 spent')).toBeTruthy()
    expect(within(foodCard).getByText('€55.00 left')).toBeTruthy()
    expect(
      within(foodCard)
        .getByRole('progressbar', { name: 'Food used' })
        .getAttribute('aria-valuenow'),
    ).toBe('45')
    // Oldest first; the bill is tagged and lives on the calendar, so no Edit or ×.
    const rows = within(foodCard).getByRole('list', { name: 'Food in November' })
    expect(
      within(rows)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['shop2 Nov€25.00Edit', 'Veg boxBill20 Nov€20.00Calendar'])
    expect(within(rows).getByRole('link', { name: 'Open Veg box in Calendar' })).toBeTruthy()
    expect(within(rows).queryByRole('button', { name: 'Edit Veg box' })).toBeNull()

    const fun = screen.getByRole('region', { name: 'Fun' })
    expect(within(fun).getByText('€75.00 spent')).toBeTruthy()
    // Over is said in words; the bar just stays full.
    expect(within(fun).getByText('€25.00 over')).toBeTruthy()
    // Untagged spending has its home in Everyday, which can be renamed but not deleted.
    const everyday = screen.getByRole('region', { name: 'Everyday' })
    expect(within(everyday).getByRole('button', { name: 'Rename Everyday' })).toBeTruthy()
    expect(within(everyday).queryByRole('button', { name: 'Delete Everyday' })).toBeNull()
  })

  it('Edit opens the edit sheet and × deletes the entry, with Undo', async () => {
    await seedEnvelopes()
    await open()
    const food = await screen.findByRole('region', { name: 'Food' })
    await userEvent.click(within(food).getByRole('button', { name: 'Edit shop' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit entry' })
    expect((within(sheet).getByRole('textbox', { name: 'Amount' }) as HTMLInputElement).value).toBe(
      '25',
    )
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit entry' })).toBeNull())

    await userEvent.click(within(food).getByRole('button', { name: 'Delete shop' }))
    await waitFor(async () =>
      expect((await r.listTransactions()).map((t) => t.note)).toEqual(['gig']),
    )
    expect(await within(food).findByText('Nothing here for November yet.')).toBeTruthy()
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await within(food).findByText('shop')).toBeTruthy()
  })

  it('“+ Add spend” adds an expense in that envelope, dated today', async () => {
    const { food } = await seedEnvelopes()
    await open()
    const card = await screen.findByRole('region', { name: 'Food' })
    await userEvent.click(within(card).getByRole('button', { name: 'Add spend to Food' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add to this day' })
    expect(
      within(sheet).getByRole('button', { name: 'Expense' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(within(sheet).getByRole('button', { name: 'Food' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '12')
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'What for' }), 'lunch')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add' }))
    await waitFor(async () =>
      expect((await r.listTransactions()).find((t) => t.note === 'lunch')).toMatchObject({
        date: '2026-11-04',
        amount: -1200,
        envelopeId: food.id,
      }),
    )
    expect(await within(card).findByText('€37.00 spent')).toBeTruthy()
  })

  it('“+ Add spend” on another month starts on that month’s first day', async () => {
    await seedEnvelopes()
    goto('/envelopes?month=2026-12')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Food' })
    await userEvent.click(within(card).getByRole('button', { name: 'Add spend to Food' }))
    const sheet = await screen.findByRole('dialog', { name: 'Add to this day' })
    expect(within(sheet).getByText('Tuesday, 1 December')).toBeTruthy()
  })

  it('renames an envelope, and deletes one with undo', async () => {
    await seedEnvelopes()
    await open()
    const food = await screen.findByRole('region', { name: 'Food' })
    await userEvent.click(within(food).getByRole('button', { name: 'Rename Food' }))
    const sheet = await screen.findByRole('dialog', { name: 'Rename Food' })
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Groceries')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save name' }))
    expect(await screen.findByRole('region', { name: 'Groceries' })).toBeTruthy()
    expect((await r.listEnvelopes()).map((e) => e.name)).toEqual(['Everyday', 'Groceries', 'Fun'])

    const fun = screen.getByRole('region', { name: 'Fun' })
    await userEvent.click(within(fun).getByRole('button', { name: 'Delete Fun' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Fun' })).toBeNull())
    expect((await r.listEnvelopes()).map((e) => e.name)).toEqual(['Everyday', 'Groceries'])
    // Its spending now counts in Everyday.
    const everyday = screen.getByRole('region', { name: 'Everyday' })
    expect(await within(everyday).findByText('gig')).toBeTruthy()

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('region', { name: 'Fun' })).toBeTruthy()
  })

  it('offers common categories while only Everyday exists', async () => {
    await r.ensureDefaultEnvelope()
    await open()
    const offer = await screen.findByRole('region', { name: 'Start with common categories?' })
    await userEvent.click(
      within(offer).getByRole('button', { name: 'Start with common categories' }),
    )
    expect(await screen.findByRole('region', { name: 'Groceries' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Start with common categories?' })).toBeNull()
  })

  it('explains envelopes while they are off, and one switch turns them on', async () => {
    await r.updateSettings({ envelopesEnabled: false })
    await open()
    expect(await screen.findByRole('region', { name: 'Envelopes are off' })).toBeTruthy()
    // The month's income is still there.
    expect(screen.getByRole('region', { name: 'Income' })).toBeTruthy()
    await userEvent.click(screen.getByRole('switch', { name: 'Use envelopes' }))
    expect(await screen.findByRole('region', { name: 'Everyday' })).toBeTruthy()
    expect((await r.getSettings()).envelopesEnabled).toBe(true)
  })
})
