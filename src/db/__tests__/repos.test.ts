import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../domain/settings'
import type { Bill } from '../../domain/types'
import * as r from '../repos'
import { db } from '../schema'
import { clearUndo, lastUndo, UNDO_LIMIT, undoLast } from '../undo'
import { resetDb } from './helpers'

beforeEach(resetDb)

const rentInput: Omit<Bill, 'id' | 'createdAt'> = {
  name: 'Rent',
  amount: 95000,
  rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
  autopay: true,
}

describe('soft-delete repos', () => {
  it.each([
    ['bills', () => r.addBill(rentInput), r.updateBill, r.deleteBill, r.restoreBill, r.listBills],
    [
      'transactions',
      () => r.addTransaction({ date: '2026-10-31', amount: -1200, note: 'coffee' }),
      r.updateTransaction,
      r.deleteTransaction,
      r.restoreTransaction,
      () => r.listTransactions(),
    ],
    [
      'funds',
      () => r.addFund({ name: 'Trip', perPeriod: 5000, openingSaved: 0 }),
      r.updateFund,
      r.deleteFund,
      r.restoreFund,
      r.listFunds,
    ],
    [
      'envelopes',
      () => r.addEnvelope({ name: 'Food', budget: 20000, color: 'sage' }),
      r.updateEnvelope,
      r.deleteEnvelope,
      r.restoreEnvelope,
      r.listEnvelopes,
    ],
  ] as const)(
    '%s: add, update, soft delete, restore',
    async (table, add, update, remove, restore, list) => {
      const row = await add()
      expect(await list()).toHaveLength(1)

      const updated = await (
        update as (id: string, p: object) => Promise<{ name?: string; note?: string }>
      )(row.id, 'note' in row ? { note: 'tea' } : { name: 'Renamed' })
      expect(updated.name ?? updated.note).toMatch(/Renamed|tea/)

      await remove(row.id)
      expect(await list()).toHaveLength(0)
      const stored = await db.table(table).get(row.id)
      expect(stored.deletedAt).toEqual(expect.any(String)) // still there for Recently deleted
      expect((await r.listRecentlyDeleted()).map((d) => d.id)).toEqual([row.id])

      await restore(row.id)
      expect(await list()).toHaveLength(1)
      expect((await db.table(table).get(row.id)).deletedAt).toBeUndefined()
    },
  )

  it('update cannot change the primary key', async () => {
    const bill = await r.addBill(rentInput)
    const next = await r.updateBill(bill.id, { id: 'hijack' } as Partial<Bill>)
    expect(next.id).toBe(bill.id)
  })

  it('rejects updates to missing rows', async () => {
    await expect(r.updateBill('nope', { name: 'x' })).rejects.toThrow(/no row nope/)
  })
})

describe('bills', () => {
  it('records paid / skipped / moved occurrences and resets them', async () => {
    const bill = await r.addBill(rentInput)
    await r.markPaid(bill.id, '2026-11-01', 95000)
    await r.skipOccurrence(bill.id, '2026-12-01')
    await r.moveOccurrence(bill.id, '2027-01-01', '2027-01-04')
    const occ = await r.listOccurrences(bill.id)
    expect(occ.map((o) => [o.id, o.status])).toEqual([
      [`${bill.id}|2026-11-01`, 'paid'],
      [`${bill.id}|2026-12-01`, 'skipped'],
      [`${bill.id}|2027-01-01`, 'moved'],
    ])
    await r.clearOccurrence(bill.id, '2026-12-01')
    expect(await r.listOccurrences(bill.id)).toHaveLength(2)
  })

  it('editBillFrom splits the series and keeps history on the old bill', async () => {
    const bill = await r.addBill(rentInput)
    await r.markPaid(bill.id, '2026-10-01', 95000)
    const next = await r.editBillFrom(bill.id, '2026-11-01', { amount: 99000 })
    expect(next?.amount).toBe(99000)
    expect(next?.rule).toMatchObject({ anchor: '2026-11-01', day: 1 })
    expect((await r.getBill(bill.id))?.until).toBe('2026-10-31')
    expect((await r.listOccurrences(bill.id))[0]?.paidAmount).toBe(95000)
    // One undo reverts the whole split.
    await undoLast()
    expect(await r.listBills()).toHaveLength(1)
    expect((await r.getBill(bill.id))?.until).toBeUndefined()
  })
})

describe('bill edits keep paid history', () => {
  it('a split carries later override rows to the new series, in one undo step', async () => {
    const bill = await r.addBill(rentInput)
    await r.markPaid(bill.id, '2026-10-01', 95000)
    await r.markPaid(bill.id, '2026-11-01', 95000) // paid early
    await r.skipOccurrence(bill.id, '2026-12-01')
    await r.addTransaction({
      date: '2026-10-31',
      amount: -95000,
      note: 'rent',
      billOccurrenceId: `${bill.id}|2026-11-01`,
    })
    const next = await r.editBillFrom(bill.id, '2026-11-01', { amount: 99000 })
    const old = await r.listOccurrences(bill.id)
    const moved = await r.listOccurrences(next!.id)
    expect(old.map((o) => o.originalDate)).toEqual(['2026-10-01'])
    expect(moved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `${next!.id}|2026-11-01`,
          status: 'paid',
          paidAmount: 95000,
        }),
        expect.objectContaining({ id: `${next!.id}|2026-12-01`, status: 'skipped' }),
      ]),
    )
    expect((await r.listTransactions())[0]?.billOccurrenceId).toBe(`${next!.id}|2026-11-01`)

    await undoLast()
    expect((await r.listOccurrences(bill.id)).map((o) => o.originalDate).sort()).toEqual([
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ])
    expect((await r.listTransactions())[0]?.billOccurrenceId).toBe(`${bill.id}|2026-11-01`)
  })

  it('a new rule for all bills splits at today when it would hide a paid one', async () => {
    const bill = await r.addBill(rentInput)
    await r.markPaid(bill.id, '2026-10-01', 95000)
    const rule = { freq: 'monthly', interval: 1, day: 5, anchor: '2026-01-05' } as const
    const next = await r.editBill(bill.id, { name: 'Flat', rule }, '2026-10-31')
    expect(next?.id).not.toBe(bill.id)
    expect(next).toMatchObject({ name: 'Flat', rule: { day: 5, anchor: '2026-11-05' } })
    // The past keeps its dates, its paid row, and the new name.
    expect(await r.getBill(bill.id)).toMatchObject({ name: 'Flat', until: '2026-10-30' })
    expect((await r.listOccurrences(bill.id))[0]).toMatchObject({ paidAmount: 95000 })
  })

  it('a new rule with nothing paid edits in place', async () => {
    const bill = await r.addBill(rentInput)
    await r.skipOccurrence(bill.id, '2026-10-01')
    const rule = { freq: 'monthly', interval: 1, day: 5, anchor: '2026-01-05' } as const
    const next = await r.editBill(bill.id, { rule }, '2026-10-31')
    expect(next?.id).toBe(bill.id)
    expect(await r.listBills()).toHaveLength(1)
  })
})

describe('debts', () => {
  const card = {
    name: 'Card',
    balance: 250000,
    balanceAsOf: '2026-10-31',
    aprBps: 2299,
    minPayment: 4000,
    dueDay: 20,
  }

  it('a new minimum leaves the ended half of a split alone', async () => {
    const { debt, bill } = await r.addDebt(card)
    const next = await r.editBillFrom(bill.id, '2026-12-01', {})
    await r.updateDebt(debt.id, { minPayment: 5000 })
    expect((await r.getBill(bill.id))?.amount).toBe(4000)
    expect((await r.getBill(next!.id))?.amount).toBe(5000)
  })

  it('creates, syncs, deletes and restores the linked minimum bill', async () => {
    const { debt, bill } = await r.addDebt(card)
    expect(bill).toMatchObject({
      debtId: debt.id,
      amount: 4000,
      rule: { freq: 'monthly', day: 20, anchor: '2026-10-31' },
    })

    await r.updateDebt(debt.id, { minPayment: 5000, dueDay: 25, name: 'Visa' })
    expect(await r.getBill(bill.id)).toMatchObject({
      amount: 5000,
      name: 'Visa',
      rule: { day: 25 },
    })

    await r.deleteDebt(debt.id)
    expect(await r.listDebts()).toHaveLength(0)
    expect(await r.listBills()).toHaveLength(0)

    await r.restoreDebt(debt.id)
    expect(await r.listDebts()).toHaveLength(1)
    expect(await r.listBills()).toHaveLength(1)
  })

  it('undo of addDebt removes both rows in one step', async () => {
    await r.addDebt(card)
    expect(await undoLast()).toBe('Add debt')
    expect(await db.debts.count()).toBe(0)
    expect(await db.bills.count()).toBe(0)
  })
})

describe('incomes', () => {
  const salary = {
    name: 'Salary',
    amount: 200000,
    schedule: { kind: 'monthly', day: 'last' } as const,
    weekendRule: 'before' as const,
    primary: false,
    active: true,
  }

  it('first income becomes primary; only one primary at a time', async () => {
    const a = await r.addIncome(salary)
    expect(a.primary).toBe(true)
    const b = await r.addIncome({ ...salary, name: 'Gig', primary: true })
    expect((await r.getIncome(a.id))?.primary).toBe(false)
    await r.setPrimaryIncome(a.id)
    expect((await r.getIncome(b.id))?.primary).toBe(false)
    expect((await r.getIncome(a.id))?.primary).toBe(true)
  })

  it('payday overrides: set, same date clears, deleting income removes them', async () => {
    const a = await r.addIncome(salary)
    await r.setPaydayOverride(a.id, '2026-12-31', '2026-12-23')
    expect(await r.listPaydayOverrides(a.id)).toEqual([
      { id: `${a.id}|2026-12-31`, incomeId: a.id, originalDate: '2026-12-31', date: '2026-12-23' },
    ])
    await r.setPaydayOverride(a.id, '2026-12-31', '2026-12-31')
    expect(await r.listPaydayOverrides(a.id)).toHaveLength(0)

    await r.setPaydayOverride(a.id, '2026-12-31', '2026-12-23')
    await r.deleteIncome(a.id)
    expect(await db.paydayOverrides.count()).toBe(0)
    await undoLast()
    expect(await db.incomes.count()).toBe(1)
    expect(await db.paydayOverrides.count()).toBe(1)
  })

  it('deleting the primary promotes another income', async () => {
    const a = await r.addIncome(salary)
    const b = await r.addIncome({ ...salary, name: 'Gig' })
    await r.deleteIncome(a.id)
    expect((await r.getIncome(b.id))?.primary).toBe(true)
  })
})

describe('envelopes', () => {
  it('ensureDefaultEnvelope is idempotent and the default cannot be deleted', async () => {
    const a = await r.ensureDefaultEnvelope()
    const b = await r.ensureDefaultEnvelope()
    expect(b.id).toBe(a.id)
    await expect(r.deleteEnvelope(a.id)).rejects.toThrow(/default/)
    expect(await lastUndo()).toBeUndefined() // setup is not an undo step
  })

  it('appends new envelopes and reorders them', async () => {
    await r.ensureDefaultEnvelope()
    const food = await r.addEnvelope({ name: 'Food', budget: 1, color: 'x' })
    const fun = await r.addEnvelope({ name: 'Fun', budget: 1, color: 'x' })
    expect([food.sort, fun.sort]).toEqual([1, 2])
    const all = await r.listEnvelopes()
    await r.reorderEnvelopes([fun.id, all[0]!.id, food.id])
    expect((await r.listEnvelopes()).map((e) => e.name)).toEqual(['Fun', 'Everyday', 'Food'])
  })
})

describe('transactions, check-ins, impulse, no-spend', () => {
  it('lists transactions by inclusive date range, oldest first', async () => {
    for (const date of ['2026-10-03', '2026-10-01', '2026-10-31', '2026-11-01']) {
      await r.addTransaction({ date, amount: -100, note: date })
    }
    const rows = await r.listTransactions('2026-10-01', '2026-10-31')
    expect(rows.map((t) => t.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-31'])
  })

  it('recent transactions are newest-created first and skip deleted ones', async () => {
    await db.transactions.bulkPut(
      ['a', 'b', 'c'].map((note, i) => ({
        id: note,
        date: '2026-10-01',
        amount: -100,
        note,
        createdAt: `2026-10-0${i + 1}T00:00:00.000Z`,
      })),
    )
    await r.deleteTransaction('c')
    expect((await r.recentTransactions(1)).map((t) => t.note)).toEqual(['b'])
  })

  it('latest check-in is by instant', async () => {
    await r.addCheckIn(1000, '2026-10-30', '2026-10-30T10:00:00.000Z')
    await r.addCheckIn(2000, '2026-10-31', '2026-10-31T10:00:00.000Z')
    expect((await r.latestCheckIn())?.balance).toBe(2000)
  })

  it('decides a batch of impulse items in one undo step', async () => {
    const a = await r.addImpulse({ name: 'A', amount: 100 })
    const b = await r.addImpulse({ name: 'B', amount: 200 })
    await r.decideImpulse([a.id, b.id], 'skipped', '2026-10-31T12:00:00.000Z')
    expect(await r.listUndecidedImpulse()).toHaveLength(0)
    expect(await undoLast()).toBe('Decide 2 items')
    expect(await r.listUndecidedImpulse()).toHaveLength(2)
  })

  it('toggles no-spend days', async () => {
    expect(await r.toggleNoSpend('2026-10-31')).toBe(true)
    expect(await r.isNoSpend('2026-10-31')).toBe(true)
    expect(await r.toggleNoSpend('2026-10-31')).toBe(false)
    expect(await r.listNoSpend()).toEqual([])
  })
})

describe('settings', () => {
  it('reads defaults, merges patches, and is not undoable', async () => {
    expect(await r.getSettings()).toEqual(DEFAULT_SETTINGS)
    await r.updateSettings({ theme: 'ocean', buffer: 5000 })
    expect(await r.getSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: 'ocean', buffer: 5000 })
    expect(await lastUndo()).toBeUndefined()
  })

  it('classifies internal meta keys', () => {
    expect(
      ['unlocked', 'changesSinceBackup', 'snoozesToday', 'settings', 'lastBackupAt'].map(
        r.isInternalMetaKey,
      ),
    ).toEqual([true, true, true, false, false])
  })
})

describe('undo log', () => {
  it('reverts the latest step, then the one before', async () => {
    const bill = await r.addBill(rentInput)
    await r.updateBill(bill.id, { amount: 1 })
    await r.deleteBill(bill.id)

    expect(await undoLast()).toBe('Delete bill')
    expect((await r.getBill(bill.id))?.deletedAt).toBeUndefined()
    expect(await undoLast()).toBe('Edit bill')
    expect((await r.getBill(bill.id))?.amount).toBe(95000)
    expect(await undoLast()).toBe('Add bill')
    expect(await r.getBill(bill.id)).toBeUndefined()
    expect(await undoLast()).toBeNull()
  })

  it(`keeps only the last ${UNDO_LIMIT} entries`, async () => {
    for (let i = 0; i < UNDO_LIMIT + 5; i++)
      await r.addTransaction({ date: '2026-10-31', amount: -i, note: `${i}` })
    expect(await db.undo.count()).toBe(UNDO_LIMIT)
    for (let i = 0; i < UNDO_LIMIT; i++) await undoLast()
    expect(await r.listTransactions()).toHaveLength(5) // the oldest 5 are no longer undoable
  })

  it('survives closing and reopening the database', async () => {
    await r.addTransaction({ date: '2026-10-31', amount: -1200, note: 'coffee' })
    db.close()
    await db.open()
    expect(await undoLast()).toBe('Add expense')
    expect(await db.transactions.count()).toBe(0)
  })

  it('a failed mutation writes nothing, not even an undo entry', async () => {
    await clearUndo()
    await expect(r.decideImpulse(['missing'], 'bought')).rejects.toThrow()
    expect(await db.undo.count()).toBe(0)
  })
})

describe('purgeDeleted', () => {
  it('hard-deletes rows deleted more than 30 days ago, with their occurrences', async () => {
    const old = await r.addBill(rentInput)
    const recent = await r.addBill(rentInput)
    await r.markPaid(old.id, '2026-09-01', 95000)
    await db.bills.update(old.id, { deletedAt: '2026-09-01T00:00:00.000Z' })
    await db.bills.update(recent.id, { deletedAt: '2026-10-20T00:00:00.000Z' })

    expect(await r.purgeDeleted(new Date('2026-10-31T00:00:00.000Z'))).toBe(1)
    expect(await db.bills.get(old.id)).toBeUndefined()
    expect(await db.billOccurrences.count()).toBe(0)
    expect(await db.bills.get(recent.id)).toBeDefined()
  })

  it('unlinks surviving rows from purged ones and drops the undo log', async () => {
    const env = await r.addEnvelope({ name: 'Food', budget: 1, color: 'x' })
    const fund = await r.addFund({ name: 'Trip', perPeriod: 1, openingSaved: 0 })
    const tx = await r.addTransaction({
      date: '2026-09-01',
      amount: -100,
      note: 'groceries',
      envelopeId: env.id,
    })
    const save = await r.addTransaction({
      date: '2026-09-01',
      amount: -50,
      note: 's',
      fundId: fund.id,
    })
    const bill = await r.addBill({ ...rentInput, envelopeId: env.id })
    await db.envelopes.update(env.id, { deletedAt: '2026-09-01T00:00:00.000Z' })
    await db.funds.update(fund.id, { deletedAt: '2026-09-01T00:00:00.000Z' })

    expect(await r.purgeDeleted(new Date('2026-10-31T00:00:00.000Z'))).toBe(2)
    expect(await db.transactions.get(tx.id)).not.toHaveProperty('envelopeId')
    expect(await db.transactions.get(save.id)).not.toHaveProperty('fundId')
    expect(await db.bills.get(bill.id)).not.toHaveProperty('envelopeId')
    expect(await db.undo.count()).toBe(0) // older before-images still pointed at the purged rows
  })

  it('purging nothing keeps the undo log', async () => {
    await r.addTransaction({ date: '2026-10-31', amount: -1, note: 'x' })
    expect(await r.purgeDeleted(new Date('2026-10-31T00:00:00.000Z'))).toBe(0)
    expect(await db.undo.count()).toBe(1)
  })
})

describe('bill occurrences merge', () => {
  it('paying a moved bill keeps its new date; undo returns to just moved', async () => {
    const bill = await r.addBill(rentInput)
    await r.moveOccurrence(bill.id, '2026-11-01', '2026-11-03')
    await r.markPaid(bill.id, '2026-11-01', 90000)
    const [row] = await r.listOccurrences(bill.id)
    expect(row).toMatchObject({ status: 'paid', movedTo: '2026-11-03', paidAmount: 90000 })
    await undoLast()
    expect((await r.listOccurrences(bill.id))[0]).toEqual({
      id: `${bill.id}|2026-11-01`,
      billId: bill.id,
      originalDate: '2026-11-01',
      status: 'moved',
      movedTo: '2026-11-03',
    })
  })

  it('markDue drops the payment, and the row when nothing else was changed', async () => {
    const bill = await r.addBill(rentInput)
    await r.markPaid(bill.id, '2026-11-01', 95000)
    await r.markDue(bill.id, '2026-11-01')
    expect(await r.listOccurrences(bill.id)).toEqual([])
    await r.setOccurrenceAmount(bill.id, '2026-12-01', 97000)
    await r.skipOccurrence(bill.id, '2026-12-01')
    await r.markDue(bill.id, '2026-12-01')
    expect((await r.listOccurrences(bill.id))[0]).toMatchObject({
      amountOverride: 97000,
      status: 'moved',
    })
  })
})
