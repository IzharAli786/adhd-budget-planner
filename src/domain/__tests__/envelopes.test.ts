import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { safeToSpend, type SafeToSpendInput } from '../safeToSpend'
import { planToday, type TodayInput } from '../today'
import type { Bill, Envelope, Transaction } from '../types'

const env = (id: string, budget: number, isDefault = false): Envelope => ({
  id,
  name: id,
  budget,
  isDefault,
  color: 'accent',
  sort: 0,
})

const spend = (amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${amount}`,
  date: '2026-11-04',
  amount: -amount,
  note: '',
  createdAt: '2026-11-04T10:00:00.000Z',
  ...extra,
})

const base: SafeToSpendInput = {
  today: '2026-11-04',
  period: { start: '2026-10-30', end: '2026-11-30' },
  checkIn: { at: '2026-11-04T08:00:00.000Z', date: '2026-11-04', balance: 100000 },
  lookback: '2026-10-30',
  transactions: [],
  bills: [],
  occurrences: [],
  envelopes: [env('everyday', 20000, true), env('food', 30000)],
  envelopesEnabled: true,
}

const groceries: Bill = {
  id: 'box',
  name: 'Veg box',
  amount: 4000,
  rule: { freq: 'once', date: '2026-11-20' },
  envelopeId: 'food',
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('envelopeReserved (PLAN §4.1)', () => {
  it.each([
    // label, transactions, bills -> everyday reserved, food reserved, food over
    ['nothing spent', [], [], 20000, 30000, 0],
    ['untagged spend uses Everyday', [spend(5000)], [], 15000, 30000, 0],
    ['tagged spend uses its envelope', [spend(5000, { envelopeId: 'food' })], [], 20000, 25000, 0],
    [
      'unknown tag falls back to Everyday',
      [spend(700, { envelopeId: 'gone' })],
      [],
      19300,
      30000,
      0,
    ],
    ['a linked unpaid bill shrinks the reserve', [], [groceries], 20000, 26000, 0],
    [
      'over the budget: reserve stops at 0',
      [spend(35000, { envelopeId: 'food' })],
      [],
      20000,
      0,
      5000,
    ],
    [
      'a refund never lifts it above the budget',
      [spend(-900, { envelopeId: 'food' })],
      [],
      20000,
      30000,
      0,
    ],
    [
      // Review fix: a salary logged as "+1500" used to refill Everyday, so the next
      // €1500 of spending came off safe-to-spend while Everyday stayed fully reserved.
      'untagged income is not Everyday money',
      [spend(-150000), spend(5000)],
      [],
      15000,
      30000,
      0,
    ],
    [
      'savings moves are not envelope spending',
      [spend(5000, { fundId: 'f' })],
      [],
      20000,
      30000,
      0,
    ],
  ] as const)('%s', (_, transactions, bills, everyday, food, foodOver) => {
    const r = safeToSpend({ ...base, transactions: [...transactions], bills: [...bills] })
    const by = new Map(r.envelopes.map((u) => [u.id, u]))
    expect(by.get('everyday')!.reserved).toBe(everyday)
    expect(by.get('food')!.reserved).toBe(food)
    expect(by.get('food')!.over).toBe(foodOver)
    expect(r.envelopeReserved).toBe(everyday + food)
  })

  it('reserved = max(0, budget − spent − linkedDue), capped at the budget', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: -5000, max: 150000 }),
        (budget, spent) => {
          const r = safeToSpend({
            ...base,
            envelopes: [env('everyday', budget, true)],
            transactions: spent === 0 ? [] : [spend(spent)],
          })
          const u = r.envelopes[0]!
          expect(u.reserved).toBe(Math.min(budget, Math.max(0, budget - spent)))
          expect(u.over).toBe(Math.max(0, spent - budget))
        },
      ),
    )
  })

  it('property: after untagged income, spending inside the room never moves the total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500000 }), // income
        fc.integer({ min: 1, max: 20000 }), // spend within Everyday's €200
        (income, x) => {
          const paid = spend(-income, { id: 'salary' })
          const before = safeToSpend({ ...base, transactions: [paid] })
          const after = safeToSpend({ ...base, transactions: [paid, spend(x, { id: 'x' })] })
          expect(after.total).toBe(before.total)
          expect(before.total).toBe(base.checkIn.balance + income - 50000)
        },
      ),
    )
  })

  it('envelopes off: no reserve and no usage rows', () => {
    const r = safeToSpend({ ...base, envelopesEnabled: false })
    expect(r.envelopeReserved).toBe(0)
    expect(r.envelopes).toEqual([])
  })
})

describe('run-to-payday with envelopes on (open issue)', () => {
  const world: TodayInput = {
    today: '2026-11-04',
    incomes: [
      {
        id: 'pay',
        name: 'Salary',
        amount: 210000,
        schedule: { kind: 'monthly', day: 'last' },
        weekendRule: 'before',
        primary: true,
        active: true,
      },
    ],
    paydayOverrides: [],
    bills: [],
    occurrences: [],
    transactions: [],
    checkIn: base.checkIn,
    envelopes: base.envelopes,
    envelopesEnabled: true,
  }
  const ready = (w: TodayInput) => {
    const p = planToday(w)
    if (p.kind !== 'ready') throw new Error('not ready')
    return p
  }

  it('spending inside an envelope keeps safe-to-spend, and leftToday drops by the spend', () => {
    const before = ready(world)
    const after = ready({ ...world, transactions: [spend(1200, { envelopeId: 'food' })] })
    expect(after.safe.total).toBe(before.safe.total)
    expect(after.runway.perDay).toBe(before.runway.perDay)
    expect(after.runway.leftToday).toBe(before.runway.leftToday - 1200)
  })

  it('property: any spend today lowers leftToday by exactly its amount, room or not', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50000, max: 300000 }), // balance
        fc.integer({ min: 0, max: 40000 }), // food budget
        fc.integer({ min: 0, max: 30000 }), // spent earlier this period
        fc.integer({ min: 1, max: 60000 }), // today's spend
        fc.constantFrom<string | undefined>('food', undefined, 'everyday'),
        (balance, budget, earlier, x, envelopeId) => {
          const w: TodayInput = {
            ...world,
            checkIn: { ...base.checkIn, balance },
            envelopes: [env('everyday', 20000, true), env('food', budget)],
            transactions: [
              spend(earlier, {
                id: 'earlier',
                date: '2026-11-01',
                envelopeId,
                createdAt: '2026-11-04T09:00:00.000Z',
              }),
            ],
          }
          const before = ready(w)
          const after = ready({
            ...w,
            transactions: [...w.transactions!, spend(x, { id: 'now', envelopeId })],
          })
          expect(after.runway.leftToday).toBe(before.runway.leftToday - x)
          expect(after.runway.perDay).toBe(before.runway.perDay)
          // Inside the room, safe-to-spend doesn't move; past it, it drops by the excess.
          const room = before.safe.envelopes.find(
            (u) => u.id === (envelopeId === 'food' ? 'food' : 'everyday'),
          )!.reserved
          expect(before.safe.total - after.safe.total).toBe(Math.max(0, x - room))
        },
      ),
    )
  })
})
