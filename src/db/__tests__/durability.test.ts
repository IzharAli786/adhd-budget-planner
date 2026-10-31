import { beforeEach, describe, expect, it } from 'vitest'
import { prepareBackupFile, readBackupFile } from '../backup'
import * as r from '../repos'
import { db } from '../schema'
import { undoLast } from '../undo'
import { resetDb } from './helpers'

beforeEach(resetDb)

const changes = () => r.getChangesSinceBackup()

describe('backup prep', () => {
  it('builds a ready File named by the LOCAL date that restores cleanly', async () => {
    await r.addTransaction({ date: '2026-10-31', amount: -1200, note: 'coffee' })
    await db.meta.put({ key: 'unlocked', value: { at: 'x', hashPrefix: 'y' } })
    // 23:30 local on the 31st; in UTC+ zones toISOString() would already say Nov 1 or
    // still say Oct 31 depending on the zone. The name must follow the local calendar.
    const now = new Date(2026, 9, 31, 23, 30)

    const file = await prepareBackupFile(now)
    expect(file.name).toBe('steady-backup-2026-10-31.json')
    expect(file.type).toBe('application/json')

    const result = await readBackupFile(file)
    expect(result.ok).toBe(true)
    const text = await file.text()
    expect(text).toContain('coffee')
    expect(text).not.toContain('unlocked')
    expect(text).not.toContain('changesSinceBackup')
  })
})

describe('changes since backup', () => {
  it('counts undoable changes (and undos), not bookkeeping, and resets on backup', async () => {
    expect(await changes()).toBe(0)
    await r.addTransaction({ date: '2026-10-31', amount: -1200, note: 'coffee' })
    await r.addBill({
      name: 'Rent',
      amount: 95000,
      rule: { freq: 'once', date: '2026-11-01' },
      autopay: false,
    })
    await r.updateSettings({ theme: 'sage' })
    await r.setMeta('lastOpened', '2026-10-31')
    expect(await changes()).toBe(2)

    await undoLast()
    expect(await changes()).toBe(3)

    await r.recordBackup('2026-10-31T12:00:00.000Z')
    expect(await changes()).toBe(0)
    expect(await r.getMeta('lastBackupAt')).toBe('2026-10-31T12:00:00.000Z')
  })
})

describe('Recently deleted', () => {
  const card = {
    name: 'Card',
    balance: 250000,
    balanceAsOf: '2026-10-31',
    aprBps: 2299,
    minPayment: 4000,
    dueDay: 20,
  }

  it.each([
    [
      'transactions',
      () => r.addTransaction({ date: '2026-10-31', amount: -1, note: 'x' }),
      r.deleteTransaction,
      () => r.listTransactions(),
    ],
    [
      'bills',
      () =>
        r.addBill({
          name: 'Gym',
          amount: 3000,
          rule: { freq: 'once', date: '2026-11-03' },
          autopay: false,
        }),
      r.deleteBill,
      r.listBills,
    ],
    [
      'funds',
      () => r.addFund({ name: 'Trip', perPeriod: 5000, openingSaved: 0 }),
      r.deleteFund,
      r.listFunds,
    ],
    [
      'envelopes',
      () => r.addEnvelope({ name: 'Food', budget: 1, color: 'x' }),
      r.deleteEnvelope,
      r.listEnvelopes,
    ],
  ] as const)(
    '%s: restoreDeleted brings it back as one undo step',
    async (_, add, remove, list) => {
      const row = await add()
      await remove(row.id)
      const [item] = await r.listRecentlyDeleted()
      expect(item?.id).toBe(row.id)

      await r.restoreDeleted(item!)
      expect(await list()).toHaveLength(1)
      expect(await r.listRecentlyDeleted()).toEqual([])

      await undoLast()
      expect(await list()).toHaveLength(0)
    },
  )

  it('lists a deleted debt once, and restoring it brings its minimum bill back', async () => {
    const { debt } = await r.addDebt(card)
    await r.deleteDebt(debt.id)
    const items = await r.listRecentlyDeleted()
    expect(items.map((i) => i.table)).toEqual(['debts'])

    await r.restoreDeleted(items[0]!)
    expect(await r.listDebts()).toHaveLength(1)
    expect(await r.listBills()).toHaveLength(1)
  })

  it('does not list the minimum bill a paid-off debt ended', async () => {
    const { debt } = await r.addDebt(card) // first due 20 Nov, so the bill has no dates left
    await r.updateDebt(debt.id, { balance: 0 }, '2026-11-05')
    expect(await r.listRecentlyDeleted()).toEqual([])
  })

  it('purgeAt is 30 days after deletion', () => {
    expect(r.purgeAt('2026-10-01T10:00:00.000Z')).toBe('2026-10-31T10:00:00.000Z')
  })

  it('"Delete all for good" purges everything deleted so far, regardless of age', async () => {
    const keep = await r.addTransaction({ date: '2026-10-31', amount: -1, note: 'keep' })
    const gone = await r.addTransaction({ date: '2026-10-31', amount: -2, note: 'gone' })
    await r.deleteTransaction(gone.id)
    expect(await r.purgeDeleted(new Date(Date.now() + 1000), 0)).toBe(1)
    expect(await db.transactions.get(gone.id)).toBeUndefined()
    expect(await db.transactions.get(keep.id)).toBeDefined()
  })
})

describe('applyFreshStart', () => {
  it('saves the balance, marks bills paid, archives items, all as one undo step', async () => {
    const rent = await r.addBill({
      name: 'Rent',
      amount: 95000,
      rule: { freq: 'once', date: '2026-11-01' },
      autopay: true,
    })
    const lamp = await r.addImpulse({ name: 'Lamp', amount: 4000 }, '2026-10-01T09:00:00.000Z')
    const at = '2026-11-20T09:00:00.000Z'

    await r.applyFreshStart({
      balance: 123400,
      date: '2026-11-20',
      paid: [{ billId: rent.id, originalDate: '2026-11-01', amount: 95000, auto: true }],
      archive: [lamp.id, 'gone-already'],
      at,
    })

    expect(await r.latestCheckIn()).toMatchObject({ balance: 123400, date: '2026-11-20', at })
    expect(await r.listOccurrences(rent.id)).toMatchObject([
      { status: 'paid', auto: true, paidAt: at },
    ])
    expect(await db.impulse.get(lamp.id)).toMatchObject({ decision: 'archived', decidedAt: at })

    expect(await undoLast()).toBe('Catch up')
    expect(await r.latestCheckIn()).toBeUndefined()
    expect(await r.listOccurrences(rent.id)).toEqual([])
    expect((await db.impulse.get(lamp.id))?.decision).toBeUndefined()
  })
})
