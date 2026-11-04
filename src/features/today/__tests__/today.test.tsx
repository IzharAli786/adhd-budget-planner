// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import * as r from '../../../db/repos'
import type { Recurrence } from '../../../domain/types'

// Wed 4 Nov 2026, noon. Planning by calendar month: 27 days left in November, today included.
const NOW = new Date(2026, 10, 4, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const salary = () =>
  r.addIncome({
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  })

const monthly = (day: number): Recurrence => ({
  freq: 'monthly',
  interval: 1,
  day,
  anchor: `2026-01-${String(day).padStart(2, '0')}`,
})

/** Bills "added" long ago, so their earlier dates count as overdue, not history. */
async function oldBill(name: string, amount: number, day: number, autopay: boolean) {
  const bill = await r.addBill({ name, amount, rule: monthly(day), autopay })
  await r.updateBill(bill.id, { createdAt: '2026-01-01T00:00:00.000Z' })
  return bill
}

/** Money basics: tracking starts on `date` with `balance` (PLAN-v2 §C). */
const start = (balance: number, date = '2026-11-04') =>
  r.updateSettings({ planBy: 'month', startDate: date, startingBalance: balance })

const overview = async () => within(await screen.findByRole('region', { name: 'Savings and debt' }))

/** A hero amount, found by the label above it ("Saved across every fund", "Still owed"). */
async function heroAmount(label: string) {
  const card = await overview()
  return card.getByText(label).nextElementSibling!.textContent
}

/** The undo toast with this message, and its Undo button. */
async function undoToast(message: string | RegExp) {
  const toast = (await screen.findByText(message)).closest('[role="status"]') as HTMLElement
  return within(toast).getByRole('button', { name: 'Undo' })
}

/** A glance tile's big number, found by its label. */
async function tile(label: string | RegExp) {
  const tiles = within(await screen.findByRole('list', { name: 'At a glance' }))
  const item = tiles.getByText(label).closest('li')!
  return item.querySelector('p:last-child')!.textContent
}
const safeTile = () => tile('November safe to spend')

describe('Today', () => {
  it('greets by name in the page title, with one quiet line under it', async () => {
    await r.updateSettings({ displayName: 'Sam' })
    await start(84250)
    render(<App />)
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Hi Sam')
    expect(screen.getByText('Your money at a glance.')).toBeTruthy()
    // One title on the page: the greeting is it.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('reads top down: saved and owed, the three tiles, Coming up, then Goals in motion', async () => {
    await start(84250)
    render(<App />)
    const hero = await screen.findByRole('region', { name: 'Savings and debt' })
    const tiles = await screen.findByRole('list', { name: 'At a glance' })
    const coming = await screen.findByRole('region', { name: 'Coming up' })
    const goals = await screen.findByRole('region', { name: 'Goals in motion' })
    const order = [hero, tiles, coming, goals]
    for (let i = 1; i < order.length; i++)
      expect(
        order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()

    // The hero: saved on the left, still owed on the right, each with its line under it.
    const card = within(hero)
    expect(card.getByText('Saved across every fund')).toBeTruthy()
    expect(card.getByText('Still owed')).toBeTruthy()
    // Three tiles, in this order.
    expect(
      within(tiles)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')!.textContent),
    ).toEqual(['November safe to spend', 'Debt minimums due monthly', 'Goals in progress'])
    // Each list section: an h2 and one link out.
    expect(within(coming).getByRole('heading', { level: 2, name: 'Coming up' })).toBeTruthy()
    expect(within(coming).getByRole('link', { name: 'Open calendar' })).toBeTruthy()
    expect(within(goals).getByRole('heading', { level: 2, name: 'Goals in motion' })).toBeTruthy()
    expect(within(goals).getByRole('link', { name: 'Open goals' })).toBeTruthy()
    // Logging lives on the floating button, the same as every other screen.
    expect(screen.getByRole('button', { name: 'Track spending' })).toBeTruthy()
  })

  it('by month, the three tiles show safe to spend, debt minimums and goals in progress', async () => {
    await start(84250)
    render(<App />)
    // No bills, no spending: the whole starting balance is safe to spend in November.
    await waitFor(async () => expect(await safeTile()).toBe('€842.50'))
    expect(await tile('Debt minimums due monthly')).toBe('€0.00')
    expect(await tile('Goals in progress')).toBe('0')
  })

  it('this month’s pay counts as money in', async () => {
    await start(0)
    await salary()
    render(<App />)
    await waitFor(async () => expect(await safeTile()).toBe('€2,100.00'))
  })

  it('a short month reads "short by", never a minus sign', async () => {
    await start(50000)
    await oldBill('Rent', 95000, 20, false)
    render(<App />)
    await waitFor(async () => expect(await tile('November short by')).toBe('€450.00'))
  })

  it('saved and still owed follow savings and debt payments; safe to spend does not', async () => {
    await start(84250)
    const fund = await r.addFund({
      name: 'Trip',
      perPeriod: 0,
      openingSaved: 10000,
      target: 100000,
    })
    const debt = await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: '2026-11-01',
      aprBps: 1999,
      minPayment: 2500,
      dueDay: 20,
    })
    render(<App />)
    const card = await overview()
    await waitFor(async () => {
      expect(await heroAmount('Saved across every fund')).toBe('€100.00')
      expect(await heroAmount('Still owed')).toBe('€500.00')
    })
    expect(card.getByText('across 1 fund, toward €1,000.00')).toBeTruthy()
    expect(card.getByText('across 1 debt')).toBeTruthy()
    expect(await safeTile()).toBe('€842.50')

    await r.addToFund(fund, 20000, '2026-11-04')
    await r.addTransaction({ date: '2026-11-04', amount: -15000, note: '', debtId: debt.debt.id })
    // Two separate writes: wait for both totals, not just the first.
    await waitFor(async () => {
      expect(await heroAmount('Saved across every fund')).toBe('€300.00')
      expect(await heroAmount('Still owed')).toBe('€350.00')
    })
    expect(await safeTile()).toBe('€842.50')
    expect(await tile('Debt minimums due monthly')).toBe('€25.00')
  })

  it('shows the cents smaller, with the amount written once', async () => {
    await start(84250)
    await r.addFund({ name: 'Trip', perPeriod: 0, openingSaved: 900000 })
    render(<App />)
    const card = await overview()
    await waitFor(async () => expect(await heroAmount('Saved across every fund')).toBe('€9,000.00'))
    const amount = card.getByText('Saved across every fund').nextElementSibling!
    // One copy of the text (nothing hidden, nothing doubled), with the cents in a span.
    expect(amount.querySelector('[aria-hidden]')).toBeNull()
    expect(amount.querySelector('span')!.textContent).toBe('.00')
    const hero = screen.getByRole('region', { name: 'Savings and debt' })
    expect(hero.textContent!.split('9,000')).toHaveLength(2)
    expect(card.getByText('Nothing owed right now.')).toBeTruthy()
  })

  it('logging spending with "Track spending" lowers safe to spend by exactly that much', async () => {
    await start(84250)
    render(<App />)
    await waitFor(async () => expect(await safeTile()).toBe('€842.50'))

    await userEvent.click(screen.getByRole('button', { name: 'Track spending' }))
    const sheet = await screen.findByRole('dialog', { name: 'Track spending' })
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Amount' }), '12')
    await userEvent.type(within(sheet).getByRole('textbox', { name: /What for/ }), 'coffee')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Log it' }))

    await waitFor(async () =>
      expect(await r.listTransactions()).toEqual([
        expect.objectContaining({ amount: -1200, note: 'coffee', date: '2026-11-04' }),
      ]),
    )
    await waitFor(async () => expect(await safeTile()).toBe('€830.50'))
  })

  it('by payday, starts with an empty state that names the next step', async () => {
    await r.updateSettings({ planBy: 'payday' })
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Let’s find your number' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add your payday' }).getAttribute('href')).toBe(
      '/bills?view=paydays',
    )
    expect(screen.queryByRole('region', { name: 'Savings and debt' })).toBeNull()
  })

  it('by payday, the first tile names the pay period and shows its amount', async () => {
    await r.updateSettings({ planBy: 'payday', startDate: '2026-10-01', startingBalance: 0 })
    await salary()
    await r.addBill({ name: 'Gym', amount: 3000, rule: monthly(12), autopay: false })
    render(<App />)
    // This period runs from October's pay (Fri 30 Oct, the 31st being a Saturday) to the
    // next one: that pay, less the Gym bill on 12 Nov.
    await waitFor(async () => expect(await tile('This pay period safe to spend')).toBe('€2,070.00'))
  })

  it('asks for a backup below the goals once two weeks pass without one', async () => {
    await start(84250, '2026-10-01')
    render(<App />)
    const card = await screen.findByRole('region', { name: 'Save a backup' })
    const goals = await screen.findByRole('region', { name: 'Goals in motion' })
    expect(goals.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(card).getByRole('button', { name: 'Back up' })).toBeTruthy()

    await userEvent.click(within(card).getByRole('button', { name: 'Not now' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Save a backup' })).toBeNull())
    const snoozes = await r.getMeta<Record<string, string>>('snoozes')
    expect(Object.values(snoozes ?? {})).toEqual([
      new Date(NOW.getTime() + 24 * 3_600_000).toISOString(),
    ])
  })

  it('no other action card: an overdue bill waits in Coming up instead', async () => {
    await start(200000, '2026-11-01')
    await oldBill('Rent', 95000, 1, false)
    render(<App />)
    const list = within(await screen.findByRole('region', { name: 'Coming up' }))
    const row = within(list.getAllByRole('listitem')[0]!)
    expect(row.getByText('Rent')).toBeTruthy()
    // Overdue says so in words (a badge after the name), not by colour or weight alone.
    const badge = row.getByText('Overdue')
    expect(
      row.getByText('Rent').compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(row.getByRole('checkbox', { name: 'Rent, 1 Nov' })).toBeTruthy()
    expect(screen.queryByText('Did Rent go out?')).toBeNull()
  })

  it('a debt minimum ticked paid lowers "Still owed", and Debt shows the same amount', async () => {
    await start(200000)
    await r.addDebt({
      name: 'Card',
      balance: 50000,
      balanceAsOf: '2026-11-01',
      aprBps: 1999,
      minPayment: 2500,
      dueDay: 20,
    })
    render(<App />)
    await waitFor(async () => expect(await heroAmount('Still owed')).toBe('€500.00'))
    const list = within(await screen.findByRole('region', { name: 'Coming up' }))
    await userEvent.click(list.getByRole('checkbox', { name: 'Card, 20 Nov' }))
    await waitFor(async () => expect(await heroAmount('Still owed')).toBe('€475.00'))
    expect(await tile('Debt minimums due monthly')).toBe('€25.00')

    // The Debt screen reads the same owed amount, not the balance entered on 1 Nov.
    cleanup()
    window.history.replaceState(null, '', '/debt')
    render(<App />)
    const row = await screen.findByRole('button', { name: /^Card/ })
    await waitFor(() => expect(row.textContent).toContain('€475.00'))
    expect(row.textContent).not.toContain('€500.00')
  })
})

describe('Coming up', () => {
  const comingUp = async () => within(await screen.findByRole('region', { name: 'Coming up' }))

  it('lists bills and paydays in date order, with a box to tick each bill', async () => {
    await start(200000)
    await salary()
    await r.addBill({ name: 'Rent', amount: 95000, rule: monthly(20), autopay: false })
    await r.addBill({ name: 'Phone', amount: 2500, rule: monthly(8), autopay: true })
    await r.addBill({ name: 'Gym', amount: 3000, rule: monthly(12), autopay: false })
    render(<App />)
    const list = await comingUp()
    const rows = list.getAllByRole('listitem').map((li) => li.textContent)
    // The next five within 45 days: December's Phone joins after Salary.
    expect(rows).toHaveLength(5)
    expect(rows[0]).toContain('8 Nov')
    expect(rows[0]).toContain('Phone')
    expect(rows[0]).toContain('Autopay')
    expect(rows[0]).toContain('€25.00')
    expect(rows[1]).toContain('Gym')
    expect(rows[2]).toContain('Rent')
    expect(rows[3]).toContain('Salary')
    expect(rows[3]).toContain('Payday')
    expect(rows[4]).toContain('8 Dec')
    expect(list.getAllByRole('checkbox')).toHaveLength(4)
    expect(list.getByRole('link', { name: 'Open calendar' }).getAttribute('href')).toBe('/bills')
  })

  it('ticking a bill marks it paid and leaves safe to spend alone', async () => {
    await start(200000)
    const gym = await r.addBill({ name: 'Gym', amount: 3000, rule: monthly(12), autopay: false })
    render(<App />)
    await waitFor(async () => expect(await safeTile()).toBe('€1,970.00'))
    // November's Gym first; December's is further down.
    const box = (await comingUp()).getAllByRole('checkbox', { name: /Gym/ })[0]!
    await userEvent.click(box)
    await waitFor(async () =>
      expect((await r.listOccurrences()).find((o) => o.billId === gym.id)).toMatchObject({
        status: 'paid',
      }),
    )
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true))
    expect(await safeTile()).toBe('€1,970.00')
    // Its name stays put ticked or not; the checked state says the rest.
    expect(box.getAttribute('aria-label')).toBe('Gym, 12 Nov')

    // One tap on Undo in the toast puts it back.
    await userEvent.click(await undoToast('Gym paid'))
    await waitFor(async () =>
      expect((await r.listOccurrences()).find((o) => o.billId === gym.id)?.status).not.toBe('paid'),
    )
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(false))

    // And ticking it off again, then back by hand.
    await userEvent.click(box)
    await waitFor(() => expect((box as HTMLInputElement).checked).toBe(true))
    await userEvent.click(box)
    await waitFor(async () =>
      expect((await r.listOccurrences()).find((o) => o.billId === gym.id)?.status).not.toBe('paid'),
    )
    expect(await undoToast('Gym back to due')).toBeTruthy()
    expect(await safeTile()).toBe('€1,970.00')
  })

  it('a note for today says "Today", has no amount and ticks off', async () => {
    await start(200000)
    await r.saveNote({ date: '2026-11-04' }, 'Dentist at 3')
    render(<App />)
    const row = (await comingUp()).getByRole('listitem')
    expect(row.textContent).toContain('Today')
    expect(row.textContent).toContain('Dentist at 3')
    expect(row.textContent).not.toContain('€')
    await userEvent.click(within(row).getByRole('checkbox'))
    await waitFor(async () => expect((await r.listNotes())[0]?.doneAt).toBeTruthy())
  })

  it('shows a payday as money in', async () => {
    await start(200000)
    await salary()
    render(<App />)
    const row = (await comingUp()).getByRole('listitem')
    expect(row.textContent).toContain('Payday')
    expect(row.textContent).toContain('+€2,100.00')
    // Nothing to tick on a payday.
    expect(within(row).queryByRole('checkbox')).toBeNull()
  })
})

describe('Goals in motion', () => {
  it('lists open goals with their date; the pill moves a goal along', async () => {
    await start(84250)
    await r.addLifeGoal({ title: 'Learn to swim', status: 'todo', targetDate: '2026-12-31' })
    render(<App />)
    const section = within(await screen.findByRole('region', { name: 'Goals in motion' }))
    expect(section.getByRole('link', { name: 'Open goals' }).getAttribute('href')).toBe('/goals')
    expect(section.getByRole('listitem').textContent).toContain('31 Dec')
    expect(await tile('Goals in progress')).toBe('0')

    await userEvent.click(
      await section.findByRole('button', { name: 'Learn to swim: Not started. Change status' }),
    )
    expect(
      await section.findByRole('button', { name: 'Learn to swim: In progress. Change status' }),
    ).toBeTruthy()
    expect((await r.listLifeGoals())[0]?.status).toBe('doing')
    await waitFor(async () => expect(await tile('Goals in progress')).toBe('1'))
    expect(await undoToast('Learn to swim: in progress')).toBeTruthy()
  })

  it('a goal marked done leaves the list, and focus moves to the next pill', async () => {
    await start(84250)
    await r.addLifeGoal({ title: 'Swim', status: 'doing', targetDate: '2026-12-01' })
    await r.addLifeGoal({ title: 'Paint', status: 'doing', targetDate: '2026-12-02' })
    await r.addLifeGoal({ title: 'Sing', status: 'todo' })
    render(<App />)
    const section = within(await screen.findByRole('region', { name: 'Goals in motion' }))
    const pill = (name: string) => section.findByRole('button', { name: new RegExp(`^${name}:`) })

    // Keyboard: In progress -> Done. The row goes; the next goal's pill takes focus.
    ;(await pill('Swim')).focus()
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(section.queryByText('Swim')).toBeNull())
    expect(document.activeElement).toBe(await pill('Paint'))
    expect(await undoToast('Swim: done')).toBeTruthy()

    // The last row done: focus goes back to the one before it.
    ;(await pill('Sing')).focus()
    await userEvent.keyboard('{Enter}') // Not started -> In progress: stays focused
    await section.findByRole('button', { name: 'Sing: In progress. Change status' })
    expect(document.activeElement).toBe(await pill('Sing'))
    // Sorted by date, Sing (none) is after Paint, so it's still last.
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(section.queryByText('Sing')).toBeNull())
    expect(document.activeElement).toBe(await pill('Paint'))

    // The only one left: focus lands on the section heading.
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(section.queryByText('Paint')).toBeNull())
    expect(document.activeElement).toBe(section.getByRole('heading', { name: 'Goals in motion' }))
    expect(section.getByRole('link', { name: 'Add a goal' })).toBeTruthy()
  })

  it('stays off Today in Simple mode, where Goals is hidden', async () => {
    await r.updateSettings({ simpleMode: true })
    await start(84250)
    render(<App />)
    await screen.findByRole('region', { name: 'Coming up' })
    expect(screen.queryByRole('region', { name: 'Goals in motion' })).toBeNull()
  })
})
