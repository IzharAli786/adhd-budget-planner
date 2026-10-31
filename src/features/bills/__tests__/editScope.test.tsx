// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import { undoLast } from '../../../db/undo'

// Only Date is faked: Dexie and React still need real timers and microtasks.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 31, 12, 0)) // Sat 31 Oct 2026, local
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

async function setup() {
  const rent = await r.addBill({
    name: 'Rent',
    amount: 95000,
    rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
    autopay: false,
  })
  window.history.replaceState(null, '', '/bills')
  render(<App />)
  return rent
}

/** Opens the sheet for tomorrow's (Nov 1) Rent and goes to its editor. */
async function editRentTomorrow() {
  const row = await screen.findByRole('button', { name: /Rent Tomorrow/ })
  await userEvent.click(row)
  await userEvent.click(await screen.findByRole('button', { name: 'Edit bill' }))
  return screen.findByRole('dialog', { name: 'Edit Rent' })
}

async function setAmount(sheet: HTMLElement, value: string) {
  const amount = within(sheet).getByRole('textbox', { name: 'Amount' })
  await userEvent.clear(amount)
  await userEvent.type(amount, value)
  await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
  return screen.findByRole('dialog', { name: 'Change which Rent bills?' })
}

describe('editing a repeating bill asks which ones change', () => {
  it('Just this one stores an amount override on that date only', async () => {
    const rent = await setup()
    const sheet = await editRentTomorrow()
    const ask = await setAmount(sheet, '990')
    await userEvent.click(within(ask).getByRole('button', { name: /Just this one/ }))
    await waitFor(async () =>
      expect(await r.listOccurrences(rent.id)).toEqual([
        expect.objectContaining({
          originalDate: '2026-11-01',
          amountOverride: 99000,
          status: 'moved',
        }),
      ]),
    )
    expect((await r.getBill(rent.id))?.amount).toBe(95000)
    expect(await screen.findByText('Changed this Rent bill')).toBeTruthy()
  })

  it('This and following splits the series at that date', async () => {
    const rent = await setup()
    await r.markPaid(rent.id, '2026-10-01', 95000)
    const sheet = await editRentTomorrow()
    const ask = await setAmount(sheet, '1000')
    await userEvent.click(within(ask).getByRole('button', { name: /This and following/ }))
    await waitFor(async () => expect(await r.listBills()).toHaveLength(2))
    const [old, next] = [
      await r.getBill(rent.id),
      (await r.listBills()).find((b) => b.id !== rent.id),
    ]
    expect(old).toMatchObject({ amount: 95000, until: '2026-10-31' })
    expect(next).toMatchObject({ amount: 100000, rule: { anchor: '2026-11-01', day: 1 } })
    // History keeps its paid amount on the old series.
    expect((await r.listOccurrences(rent.id))[0]).toMatchObject({ paidAmount: 95000 })
    // One undo reverts the whole split.
    await undoLast()
    expect(await r.listBills()).toHaveLength(1)
  })

  it('All edits the series in place', async () => {
    const rent = await setup()
    const sheet = await editRentTomorrow()
    const ask = await setAmount(sheet, '960')
    await userEvent.click(within(ask).getByRole('button', { name: /^All/ }))
    await waitFor(async () => expect((await r.getBill(rent.id))?.amount).toBe(96000))
    expect(await r.listBills()).toHaveLength(1)
    expect(await r.listOccurrences(rent.id)).toEqual([])
  })

  it('Just this one is unavailable when more than the amount changed', async () => {
    await setup()
    const sheet = await editRentTomorrow()
    const name = within(sheet).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Flat')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    const ask = await screen.findByRole('dialog', { name: 'Change which Rent bills?' })
    expect(
      within(ask)
        .getByRole('button', { name: /Just this one/ })
        .hasAttribute('disabled'),
    ).toBe(true)
  })

  it('deleting the series asks first, naming the bill', async () => {
    const rent = await setup()
    const sheet = await editRentTomorrow()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete Rent?' })
    expect(await r.listBills()).toHaveLength(1)
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete Rent' }))
    await waitFor(async () => expect((await r.getBill(rent.id))?.deletedAt).toBeDefined())
  })
})

describe('occurrence actions', () => {
  it('one tap marks paid, and Undo in the toast reverts it', async () => {
    const rent = await setup()
    await userEvent.click((await screen.findAllByRole('button', { name: 'Mark Rent paid' }))[0]!)
    await waitFor(async () =>
      expect((await r.listOccurrences(rent.id))[0]).toMatchObject({ status: 'paid' }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(async () => expect(await r.listOccurrences(rent.id)).toEqual([]))
  })

  it('pays a different amount from the sheet', async () => {
    const rent = await setup()
    await userEvent.click(await screen.findByRole('button', { name: /Rent Tomorrow/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Rent' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Paid a different amount?' }))
    const amount = within(sheet).getByRole('textbox', { name: 'Amount paid' })
    await userEvent.clear(amount)
    await userEvent.type(amount, '940')
    await userEvent.click(within(sheet).getByRole('button', { name: /Mark paid/ }))
    await waitFor(async () =>
      expect((await r.listOccurrences(rent.id))[0]).toMatchObject({
        status: 'paid',
        paidAmount: 94000,
      }),
    )
    // The bill itself keeps its usual amount.
    expect((await r.getBill(rent.id))?.amount).toBe(95000)
  })
})
