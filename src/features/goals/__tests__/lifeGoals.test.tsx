// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { db } from '../../../db/schema'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'

// Wed 4 Nov 2026, noon local.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  await r.updateSettings({ simpleMode: false })
  localStorage.clear()
  window.history.replaceState(null, '', '/goals')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const card = () => screen.findByRole('region', { name: 'Life goals' })

describe('Goals: life goals', () => {
  it('adds a goal linked to a fund, edits it, marks it done, and deletes it with undo', async () => {
    const fund = await r.addFund({
      name: 'Lisbon',
      target: 100000,
      perPeriod: 0,
      openingSaved: 25000,
    })
    render(<App />)
    await userEvent.click(within(await card()).getByRole('button', { name: 'Add a life goal' }))
    const sheet = await screen.findByRole('dialog', { name: 'New life goal' })
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Goal' }),
      '  A week in Lisbon ',
    )
    await userEvent.type(
      within(sheet).getByRole('textbox', { name: 'Why it matters (optional)' }),
      'Sun, and no screens',
    )
    await userEvent.selectOptions(
      within(sheet).getByRole('combobox', { name: 'Linked to (optional)' }),
      'Lisbon',
    )
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add goal' }))

    const goals = await card()
    expect(await within(goals).findByRole('heading', { name: 'A week in Lisbon' })).toBeTruthy()
    expect(within(goals).getByText('Sun, and no screens')).toBeTruthy()
    expect(within(goals).getByText(/Not started/)).toBeTruthy()
    // The linked fund's progress shows with the goal.
    expect(
      within(goals)
        .getByRole('progressbar', { name: 'Lisbon progress' })
        .getAttribute('aria-valuenow'),
    ).toBe('25')
    const [stored] = await r.listLifeGoals()
    expect(stored).toMatchObject({ title: 'A week in Lisbon', status: 'todo', fundId: fund.id })

    // Edit: status and title.
    await userEvent.click(within(goals).getByRole('button', { name: 'Edit A week in Lisbon' }))
    const edit = await screen.findByRole('dialog', { name: 'Edit A week in Lisbon' })
    const title = within(edit).getByRole('textbox', { name: 'Goal' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Two weeks in Lisbon')
    await userEvent.click(within(edit).getByRole('radio', { name: 'In progress' }))
    await userEvent.click(within(edit).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(goals).getByText(/In progress/)).toBeTruthy()

    // One tap to done, with a done date.
    await userEvent.click(await within(goals).findByRole('button', { name: 'Mark done' }))
    await waitFor(async () =>
      expect((await r.listLifeGoals())[0]).toMatchObject({
        status: 'done',
        doneAt: NOW.toISOString(),
      }),
    )
    expect(await within(goals).findByText(/1 of 1 done/)).toBeTruthy()

    // Delete, then undo brings it back exactly.
    const before = await db.lifeGoals.toArray()
    await userEvent.click(within(goals).getByRole('button', { name: 'Edit Two weeks in Lisbon' }))
    const del = await screen.findByRole('dialog', { name: 'Edit Two weeks in Lisbon' })
    await userEvent.click(within(del).getByRole('button', { name: 'Delete goal' }))
    await waitFor(async () => expect(await db.lifeGoals.count()).toBe(0))
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await db.lifeGoals.toArray()).toEqual(before))
    expect(
      await within(await card()).findByRole('heading', { name: 'Two weeks in Lisbon' }),
    ).toBeTruthy()
  })

  it('a goal linked to a debt shows how much is paid off', async () => {
    const { debt } = await r.addDebt({
      name: 'Card',
      balance: 200000,
      balanceAsOf: '2026-11-01',
      aprBps: 1999,
      minPayment: 2500,
      dueDay: 20,
    })
    await db.debts.update(debt.id, { balance: 50000 })
    await r.addLifeGoal({ title: 'Debt-free by summer', status: 'doing', debtId: debt.id })
    render(<App />)
    const goals = await card()
    expect(await within(goals).findByText(/€500.00 left/)).toBeTruthy()
    expect(
      within(goals)
        .getByRole('progressbar', { name: 'Card paid off' })
        .getAttribute('aria-valuenow'),
    ).toBe('75')
  })
})
