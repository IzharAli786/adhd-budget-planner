import { beforeEach, describe, expect, it } from 'vitest'
import * as r from '../repos'
import { undoLast } from '../undo'
import { resetDb } from './helpers'

beforeEach(resetDb)

describe('reconcileCheckIn', () => {
  it('saves the balance and the paid bills as one undo step', async () => {
    const bill = await r.addBill({
      name: 'Phone',
      amount: 2500,
      rule: { freq: 'monthly', interval: 1, day: 2, anchor: '2026-01-02' },
      autopay: true,
    })
    // An earlier "just this one" amount change must survive being marked paid.
    await r.setOccurrenceAmount(bill.id, '2026-11-02', 3000)
    const at = '2026-11-04T09:00:00.000Z'
    await r.reconcileCheckIn({
      balance: 84250,
      date: '2026-11-04',
      at,
      paid: [{ billId: bill.id, originalDate: '2026-11-02', amount: 3000, auto: true }],
    })
    expect(await r.latestCheckIn()).toMatchObject({ balance: 84250, date: '2026-11-04', at })
    expect(await r.listOccurrences(bill.id)).toEqual([
      expect.objectContaining({
        status: 'paid',
        paidAmount: 3000,
        amountOverride: 3000,
        paidAt: at,
        auto: true,
      }),
    ])

    expect(await undoLast()).toBe('Check in balance')
    expect(await r.latestCheckIn()).toBeUndefined()
    expect(await r.listOccurrences(bill.id)).toEqual([
      expect.objectContaining({ status: 'moved', amountOverride: 3000 }),
    ])
  })

  it('addCheckIn still works on its own', async () => {
    await r.addCheckIn(100, '2026-11-04', '2026-11-04T09:00:00.000Z')
    expect(await r.listCheckIns()).toHaveLength(1)
  })
})
