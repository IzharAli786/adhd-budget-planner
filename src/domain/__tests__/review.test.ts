import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import {
  carryOver,
  flowsIn,
  monthRanges,
  payPeriodRanges,
  periodSummaries,
  previousPayPeriod,
  reviewYears,
  totalFlows,
  type ReviewInput,
} from '../review'
import type { Bill, IncomeSource, Transaction } from '../types'

// Salary on the last weekday-adjusted day of the month: Fri 30 Oct, Mon 30 Nov 2026.
const salary: IncomeSource = {
  id: 'pay',
  name: 'Salary',
  amount: 210000,
  schedule: { kind: 'monthly', day: 'last' },
  weekendRule: 'before',
  primary: true,
  active: true,
}

let n = 0
const tx = (date: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`,
  date,
  amount,
  note: '',
  createdAt: `${date}T10:00:00.000Z`,
  ...extra,
})

const rent: Bill = {
  id: 'rent',
  name: 'Rent',
  amount: 90000,
  rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
  autopay: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}
const card: Bill = {
  id: 'card',
  name: 'Card',
  amount: 5000,
  rule: { freq: 'monthly', interval: 1, day: 15, anchor: '2026-01-15' },
  debtId: 'card',
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const base: ReviewInput = {
  today: '2026-11-04',
  incomes: [salary],
  paydayOverrides: [],
  bills: [rent, card],
  occurrences: [
    {
      id: 'rent|2026-10-01',
      billId: 'rent',
      originalDate: '2026-10-01',
      status: 'paid',
      paidAt: 'x',
    },
    {
      id: 'card|2026-10-15',
      billId: 'card',
      originalDate: '2026-10-15',
      status: 'paid',
      paidAt: 'x',
      paidAmount: 6000,
    },
    {
      id: 'rent|2026-11-01',
      billId: 'rent',
      originalDate: '2026-11-01',
      status: 'paid',
      paidAt: 'x',
    },
  ],
  transactions: [
    tx('2026-10-03', -4500),
    tx('2026-10-20', -2000),
    tx('2026-10-21', 1500), // a refund
    tx('2026-10-25', -10000, { fundId: 'rainy' }),
    tx('2026-10-26', 2500, { fundId: 'rainy' }), // took some back out
    tx('2026-10-28', -3000, { debtId: 'card' }),
    tx('2026-11-02', -1200),
  ],
  checkIns: [],
}

describe('flowsIn', () => {
  it('adds up October: pay, spending, bills, savings, debt', () => {
    const october = flowsIn(base, { start: '2026-10-01', end: '2026-11-01' })
    expect(october).toEqual({
      incomeIn: 210000 + 1500,
      spending: 6500,
      billsPaid: 90000,
      debtPaid: 6000 + 3000,
      moneyOut: 6500 + 90000 + 9000,
      saved: 7500,
      net: 211500 - 105500 - 7500,
    })
  })

  it('does not count a payday that has not come yet', () => {
    const november = flowsIn(base, { start: '2026-11-01', end: '2026-12-01' })
    expect(november.incomeIn).toBe(0)
    expect(november.moneyOut).toBe(90000 + 1200)
  })

  it('ignores deleted rows and unpaid bills', () => {
    const input = {
      ...base,
      occurrences: [],
      transactions: [tx('2026-10-03', -4500, { deletedAt: '2026-10-04T00:00:00.000Z' })],
    }
    const october = flowsIn(input, { start: '2026-10-01', end: '2026-11-01' })
    expect(october.moneyOut).toBe(0)
  })
})

describe('ranges', () => {
  it('has twelve calendar months', () => {
    const months = monthRanges(2026)
    expect(months).toHaveLength(12)
    expect(months[1]).toEqual({ start: '2026-02-01', end: '2026-03-01' })
    expect(months[11]).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('pay periods start on paydays in the span and end on the next one', () => {
    const periods = payPeriodRanges(base, { start: '2026-10-01', end: '2026-12-01' })
    expect(periods).toEqual([
      { start: '2026-10-30', end: '2026-11-30' },
      { start: '2026-11-30', end: '2026-12-31' },
    ])
  })

  it('finds the previous pay period', () => {
    expect(previousPayPeriod(base, '2026-10-30')).toEqual({
      start: '2026-09-30',
      end: '2026-10-30',
    })
    expect(previousPayPeriod({ ...base, incomes: [] }, '2026-10-30')).toBeNull()
  })
})

describe('periodSummaries', () => {
  it('runs from the start of the history to today, nothing invented', () => {
    // History starts 3 Oct, today is 4 Nov: October and November.
    expect(periodSummaries(2026, 'month', base).map((r) => r.start)).toEqual([
      '2026-10-01',
      '2026-11-01',
    ])
    expect(periodSummaries(2026, 'month', { ...base, since: '2026-01-01' })).toHaveLength(11)
    const periods = periodSummaries(2026, 'payday', base)
    expect(periods.at(-1)!.start).toBe('2026-10-30')
  })

  it('the year total equals the flows over the whole year (months tile the year)', () => {
    const rows = periodSummaries(2026, 'month', { ...base, today: '2026-12-31' })
    const whole = flowsIn(
      { ...base, today: '2026-12-31' },
      { start: '2026-01-01', end: '2027-01-01' },
    )
    expect(totalFlows(rows)).toEqual(whole)
  })

  it('lists the years from the first entry', () => {
    expect(reviewYears({ ...base, transactions: [tx('2024-05-01', -100)] })).toEqual([
      2024, 2025, 2026,
    ])
  })
})

describe('carryOver', () => {
  it('uses the amount saved at the payday moment first', () => {
    const input = { ...base, periodClose: { '2026-10-30': { carried: 4200, at: 'x' } } }
    expect(carryOver(input, '2026-10-30')).toEqual({ amount: 4200, source: 'saved' })
  })

  it('works back from a check-in in that period, taking the pay off', () => {
    const input = {
      ...base,
      checkIns: [{ at: '2026-11-02T20:00:00.000Z', date: '2026-11-02', balance: 150000 }],
    }
    // Since payday: +2100 pay, −900 rent, −12 spent. 1500 − 1188 = 312 carried.
    expect(carryOver(input, '2026-10-30', '2026-11-30')).toEqual({
      amount: 150000 - (210000 - 90000 - 1200),
      source: 'check-in',
    })
  })

  it('rolls forward from an earlier check-in', () => {
    const input = {
      ...base,
      checkIns: [{ at: '2026-10-19T08:00:00.000Z', date: '2026-10-19', balance: 50000 }],
    }
    // 20–29 Oct: −20 spent, +15 refund, −75 saved, −30 to the card.
    expect(carryOver(input, '2026-10-30', '2026-11-30')).toEqual({
      amount: 50000 - 2000 + 1500 - 7500 - 3000,
      source: 'flows',
    })
  })

  it('is unknown with no balance to start from', () => {
    expect(carryOver(base, '2026-10-30')).toBeNull()
  })

  it('is unknown for a payday before the history starts', () => {
    const input = {
      ...base,
      transactions: [],
      checkIns: [{ at: 'x', date: '2026-11-02', balance: 150000 }],
    }
    expect(carryOver(input, '2026-10-30', '2026-11-30')).toBeNull()
  })

  it('does not count paydays from before the history starts', () => {
    const input = { ...base, transactions: [tx('2026-10-03', -4500)] }
    expect(flowsIn(input, { start: '2026-01-01', end: '2026-11-01' }).incomeIn).toBe(210000)
  })

  it('next carry = this carry + this period’s net (property)', () => {
    const arb = fc.record({
      balance: fc.integer({ min: -100000, max: 1000000 }),
      checkInDay: fc.integer({ min: 0, max: 30 }),
      flows: fc.array(
        fc.record({
          day: fc.integer({ min: 0, max: 60 }),
          amount: fc.integer({ min: -50000, max: 50000 }),
          kind: fc.constantFrom('spend', 'fund', 'debt'),
        }),
        { maxLength: 15 },
      ),
    })
    fc.assert(
      fc.property(arb, ({ balance, checkInDay, flows }) => {
        const p1 = '2026-09-30'
        const p2 = '2026-10-30'
        const input: ReviewInput = {
          ...base,
          bills: [],
          occurrences: [],
          today: '2026-12-31',
          checkIns: [{ at: 'x', date: addDays(p1, checkInDay % 30), balance }],
          // One early entry, so the history starts before both paydays.
          transactions: [tx('2026-09-01', -100)].concat(
            flows.map((f) =>
              tx(addDays('2026-09-20', f.day), f.amount, {
                ...(f.kind === 'fund' ? { fundId: 'f' } : f.kind === 'debt' ? { debtId: 'd' } : {}),
              }),
            ),
          ),
        }
        const first = carryOver(input, p1, p2)!
        const second = carryOver(input, p2, '2026-11-30')!
        expect(second.amount).toBe(first.amount + flowsIn(input, { start: p1, end: p2 }).net)
      }),
    )
  })
})
