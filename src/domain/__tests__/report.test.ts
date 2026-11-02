import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { addDays } from '../dates'
import { buildReport, largestRemainder, reportFileName, type ReportInput } from '../report'
import { flowsIn, periodSummaries } from '../review'
import type { Bill, Envelope, IncomeSource, Transaction } from '../types'

// Salary on the last weekday-adjusted day of the month: Wed 30 Sep, Fri 30 Oct 2026.
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
  envelopeId: 'home',
  createdAt: '2026-01-01T00:00:00.000Z',
}
const card: Bill = {
  id: 'card',
  name: 'Card minimum',
  amount: 5000,
  rule: { freq: 'monthly', interval: 1, day: 15, anchor: '2026-01-15' },
  debtId: 'visa',
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}
const gym: Bill = {
  id: 'gym',
  name: 'Gym',
  amount: 3000,
  rule: { freq: 'monthly', interval: 1, day: 20, anchor: '2026-01-20' },
  autopay: false,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const env = (id: string, name: string, extra: Partial<Envelope> = {}): Envelope => ({
  id,
  name,
  budget: 10000,
  isDefault: false,
  color: 'sage',
  sort: 0,
  ...extra,
})

const base: ReportInput = {
  today: '2026-11-04',
  since: '2026-09-25',
  incomes: [salary],
  paydayOverrides: [],
  bills: [rent, card, gym],
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
    { id: 'gym|2026-10-20', billId: 'gym', originalDate: '2026-10-20', status: 'skipped' },
  ],
  transactions: [
    tx('2026-10-01', -4500, { envelopeId: 'food', note: 'Groceries' }),
    tx('2026-10-03', -2000, { envelopeId: 'gone', note: 'Takeaway' }),
    tx('2026-10-21', 1500, { note: 'Refund' }),
    tx('2026-10-25', -10000, { fundId: 'rainy' }),
    tx('2026-10-26', 2500, { fundId: 'rainy' }),
    tx('2026-10-28', -3000, { debtId: 'visa', note: 'Extra' }),
    // Paying the card minimum through an entry: it is the paid bill, not a second payment.
    tx('2026-10-15', -6000, { debtId: 'visa', billOccurrenceId: 'card|2026-10-15' }),
    tx('2026-10-31', -999, { note: 'Last day' }),
    tx('2026-11-01', -777, { note: 'Next month' }),
    tx('2026-09-30', -555, { note: 'Day before' }),
    tx('2026-10-10', -100000, { deletedAt: '2026-10-11T00:00:00.000Z' }),
  ],
  checkIns: [
    { at: '2026-09-28T09:00:00.000Z', date: '2026-09-28', balance: 40000 },
    { at: '2026-10-12T09:00:00.000Z', date: '2026-10-12', balance: 70000 },
    { at: '2026-10-12T18:00:00.000Z', date: '2026-10-12', balance: 65000 },
  ],
  envelopes: [
    env('food', 'Groceries', { isDefault: true }),
    env('home', 'Home', { color: 'clay' }),
    env('gone', 'Takeaways', { deletedAt: '2026-10-20T00:00:00.000Z' }),
  ],
  envelopesEnabled: false,
  funds: [{ id: 'rainy', name: 'Rainy day', target: 100000, perPeriod: 5000, openingSaved: 20000 }],
  debts: [
    {
      id: 'visa',
      name: 'Visa',
      balance: 120000,
      balanceAsOf: '2026-10-01',
      originalBalance: 200000,
      aprBps: 1990,
      minPayment: 5000,
      dueDay: 15,
    },
  ],
  notes: [
    { id: 'day|2026-10-05', date: '2026-10-05', text: 'Dentist', updatedAt: 'x' },
    { id: 'day|2026-11-05', date: '2026-11-05', text: 'Out of range', updatedAt: 'x' },
    { id: 'period|2026-09-30', periodStart: '2026-09-30', text: 'Birthday month', updatedAt: 'x' },
    { id: 'day|2026-10-06', date: '2026-10-06', text: '   ', updatedAt: 'x' },
  ],
  noSpend: [{ date: '2026-10-02' }, { date: '2026-10-03' }, { date: '2026-11-02' }],
  impulse: [
    {
      id: 'i1',
      name: 'Shoes',
      amount: 8000,
      addedAt: 'x',
      decision: 'skipped',
      decidedAt: '2026-10-09T12:00:00.000Z',
    },
    {
      id: 'i2',
      name: 'Book',
      amount: 1500,
      addedAt: 'x',
      decision: 'bought',
      decidedAt: '2026-10-11T12:00:00.000Z',
    },
    {
      id: 'i3',
      name: 'Lamp',
      amount: 4000,
      addedAt: 'x',
      decision: 'skipped',
      decidedAt: '2026-11-01T12:00:00.000Z',
    },
  ],
  lifeGoals: [
    {
      id: 'g1',
      title: 'Emergency fund',
      status: 'done',
      createdAt: 'x',
      doneAt: '2026-10-30T10:00:00.000Z',
    },
    { id: 'g2', title: 'Learn to drive', status: 'doing', createdAt: 'x' },
  ],
  currency: 'EUR',
  decimals: 2,
  locale: 'en-IE',
  generatedOn: '2026-11-04',
}

const october = () => buildReport(base, '2026-10-01', '2026-10-31')

describe('buildReport', () => {
  it('rejects a range that starts after it ends, or a date that is not a date', () => {
    expect(() => buildReport(base, '2026-10-31', '2026-10-01')).toThrow(RangeError)
    expect(() => buildReport(base, '2026-10-1', '2026-10-31')).toThrow(RangeError)
    expect(() => buildReport(base, '2026-02-30', '2026-03-01')).toThrow(RangeError)
  })

  it('counts the days with both ends included', () => {
    expect(october().meta).toMatchObject({ from: '2026-10-01', to: '2026-10-31', days: 31 })
    expect(buildReport(base, '2026-10-15', '2026-10-15').meta.days).toBe(1)
  })

  it.each([
    // [from, to, the notes of the transactions included]
    ['2026-10-31', '2026-10-31', ['Last day']],
    ['2026-10-01', '2026-10-01', ['Groceries']],
    ['2026-09-30', '2026-09-30', ['Day before']],
    ['2026-11-01', '2026-11-01', ['Next month']],
    ['2026-10-02', '2026-10-02', []],
  ])('includes exactly the entries from %s to %s', (from, to, notes) => {
    expect(buildReport(base, from, to).transactions.map((t) => t.note)).toEqual(notes)
  })

  it('lists every live transaction in order, with its kind and signed amount', () => {
    const rows = october().transactions
    expect(rows.map((t) => t.kind)).toEqual([
      'Spending',
      'Spending',
      'Bill payment',
      'Income',
      'Into savings',
      'From savings',
      'Debt payment',
      'Spending',
    ])
    expect(rows[2]).toMatchObject({ category: 'Card minimum', amount: -6000 })
    expect(rows[4]).toMatchObject({ category: 'Rainy day', amount: -10000 })
    expect(rows[6]).toMatchObject({ category: 'Visa', amount: -3000 })
    // Deleted entries are left out; deleted envelopes keep their name.
    expect(rows.some((t) => t.amount === -100000)).toBe(false)
    expect(rows[1]).toMatchObject({ category: 'Takeaways', note: 'Takeaway' })
  })

  it('sorts same-day entries by when they were entered', () => {
    const input = {
      ...base,
      transactions: [
        tx('2026-10-05', -1, { note: 'second', createdAt: '2026-10-05T12:00:00.000Z' }),
        tx('2026-10-05', -2, { note: 'first', createdAt: '2026-10-05T08:00:00.000Z' }),
      ],
    }
    expect(buildReport(input, '2026-10-05', '2026-10-05').transactions.map((t) => t.note)).toEqual([
      'first',
      'second',
    ])
  })

  it('agrees with Look back for a month, counting a bill and its entry once', () => {
    const { summary } = october()
    const [row] = periodSummaries({ start: '2026-10-01', end: '2026-11-01' }, 'month', base)
    expect(summary.moneyIn).toBe(row!.incomeIn)
    expect(summary.moneyOut).toBe(row!.moneyOut)
    expect(summary.spending).toBe(row!.spending)
    expect(summary.billsPaid).toBe(row!.billsPaid)
    expect(summary.debtPaid).toBe(row!.debtPaid)
    expect(summary.savedToFunds - summary.takenFromFunds).toBe(row!.saved)
    expect(summary.leftOver).toBe(row!.net)
    // Pay 2100 + refund 15; spending 45 + 20 + 9.99; rent 900; card 60 (once) + extra 30.
    expect(summary).toMatchObject({
      moneyIn: 211500,
      spending: 7499,
      billsPaid: 90000,
      debtPaid: 9000,
      moneyOut: 7499 + 90000 + 9000,
      savedToFunds: 10000,
      takenFromFunds: 2500,
    })
  })

  it('takes balances from check-ins and never invents one', () => {
    const { summary } = october()
    expect(summary.startBalance).toEqual({ date: '2026-09-28', balance: 40000 })
    // The later check-in on the same day corrects the earlier one.
    expect(summary.endBalance).toEqual({ date: '2026-10-12', balance: 65000 })
    const before = buildReport(base, '2026-09-01', '2026-09-27').summary
    expect(before.startBalance).toBeNull()
    expect(before.endBalance).toBeNull()
  })

  it('splits bills into paid, skipped and still due', () => {
    const { bills } = october()
    expect(bills.paid.map((b) => b.name)).toEqual(['Rent', 'Card minimum'])
    expect(bills.paid[1]).toMatchObject({ amount: 6000, debt: 'Visa' })
    expect(bills.skipped.map((b) => b.name)).toEqual(['Gym'])
    expect(bills.dueUnpaid).toEqual([])
    expect(bills.totals).toEqual({ paid: 96000, skipped: 3000, dueUnpaid: 0 })
    const nov = buildReport(base, '2026-11-01', '2026-11-30').bills
    expect(nov.dueUnpaid.map((b) => b.name)).toEqual(['Rent', 'Card minimum', 'Gym'])
  })

  it('shows where the money went with shares that add up to 100', () => {
    const kinds = october().byCategory
    // Savings is the net move in: 100 in, 25 back out.
    expect(kinds.map((r) => [r.name, r.amount])).toEqual([
      ['Bills', 90000],
      ['Debt', 9000],
      ['Savings', 7500],
      ['Everyday spending', 7499],
    ])
    expect(kinds.reduce((a, r) => a + r.share, 0)).toBe(100)

    const envelopes = buildReport({ ...base, envelopesEnabled: true }, '2026-10-01', '2026-10-31')
    expect(envelopes.categoryMode).toBe('envelope')
    // Rent is linked to Home; the deleted envelope's spending lands in the default one.
    expect(envelopes.byCategory.map((r) => [r.name, r.amount])).toEqual([
      ['Home', 90000],
      ['Debt', 9000],
      ['Groceries', 7499],
    ])
    expect(envelopes.byCategory[0]!.colorToken).toBe('clay')
    expect(envelopes.byCategory.reduce((a, r) => a + r.share, 0)).toBe(100)
  })

  it('reports funds, debts, check-ins, notes, no-spend days, the 48-hour list and goals', () => {
    const r = october()
    expect(r.funds).toEqual([
      {
        name: 'Rainy day',
        movedIn: 10000,
        movedOut: 2500,
        savedAtEnd: 27500,
        target: 100000,
        percent: 28,
      },
    ])
    expect(r.debts).toEqual([
      { name: 'Visa', paidInRange: 9000, balanceNow: 120000, aprPercent: 19.9, minimum: 5000 },
    ])
    expect(r.checkIns.map((c) => c.balance)).toEqual([70000, 65000])
    expect(r.notes).toEqual([
      { kind: 'period', date: '2026-09-30', until: '2026-10-29', text: 'Birthday month' },
      { kind: 'day', date: '2026-10-05', text: 'Dentist' },
    ])
    // 3 Oct was marked, but a takeaway was logged that day.
    expect(r.noSpendDays).toEqual({ count: 1, dates: ['2026-10-02'] })
    expect(r.impulse).toMatchObject({ skippedTotal: 8000, skippedCount: 1, boughtCount: 1 })
    expect(r.lifeGoalsDone).toEqual([{ title: 'Emergency fund', date: '2026-10-30' }])
    expect(r.isEmpty).toBe(false)
  })

  it('returns zeros and isEmpty for a range with nothing in it', () => {
    const r = buildReport(base, '2025-01-01', '2025-01-31')
    expect(r.isEmpty).toBe(true)
    expect(r.summary).toMatchObject({ moneyIn: 0, moneyOut: 0, leftOver: 0 })
    expect(r.transactions).toEqual([])
    expect(r.byCategory).toEqual([])
  })

  it('names the bill of an old bill payment even after the bill is deleted', () => {
    const oldBill: Bill = {
      ...gym,
      id: 'tv',
      name: 'TV licence',
      deletedAt: '2026-10-30T00:00:00.000Z',
    }
    const input: ReportInput = {
      ...base,
      transactions: [tx('2026-10-09', -1500, { billOccurrenceId: 'tv|2026-10-09' })],
      allBills: [...base.bills, oldBill],
    }
    const [row] = buildReport(input, '2026-10-01', '2026-10-31').transactions
    expect(row).toMatchObject({ kind: 'Bill payment', category: 'TV licence', amount: -1500 })
  })

  it('names the file after the range', () => {
    expect(reportFileName('2026-10-01', '2026-10-31')).toBe(
      'steady-report-2026-10-01_to_2026-10-31.pdf',
    )
  })
})

describe('largestRemainder', () => {
  it('adds up to exactly 100 whatever the amounts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10_000_000 }), { minLength: 1, maxLength: 30 }),
        (xs) => {
          const shares = largestRemainder(xs)
          expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
          shares.forEach((s, i) =>
            expect(Math.abs(s - (xs[i]! / xs.reduce((a, b) => a + b)) * 100)).toBeLessThan(1),
          )
        },
      ),
    )
  })

  it('gives zeros when there is nothing', () => {
    expect(largestRemainder([0, 0])).toEqual([0, 0])
  })
})

describe('buildReport properties', () => {
  const arb = fc.record({
    entries: fc.array(
      fc.record({
        day: fc.integer({ min: 0, max: 90 }),
        amount: fc.integer({ min: -50000, max: 50000 }).filter((a) => a !== 0),
        kind: fc.constantFrom('spend', 'fund', 'debt', 'bill'),
      }),
      { maxLength: 40 },
    ),
    from: fc.integer({ min: 0, max: 90 }),
    len: fc.integer({ min: 0, max: 60 }),
  })

  it('always lists entries sorted, inside the range, and money out as the sum of its parts', () => {
    fc.assert(
      fc.property(arb, ({ entries, from, len }) => {
        const start = '2026-08-01'
        const transactions = entries.map((e, i) =>
          tx(addDays(start, e.day), e.amount, {
            createdAt: `${addDays(start, e.day)}T10:00:${String(i % 60).padStart(2, '0')}.000Z`,
            ...(e.kind === 'fund' ? { fundId: 'rainy' } : {}),
            ...(e.kind === 'debt' ? { debtId: 'visa' } : {}),
            ...(e.kind === 'bill' ? { billOccurrenceId: `gym|${addDays(start, e.day)}` } : {}),
          }),
        )
        const input = { ...base, since: start, occurrences: [], transactions }
        const f = addDays(start, from)
        const t = addDays(f, len)
        const r = buildReport(input, f, t)
        const dates = r.transactions.map((x) => x.date)
        expect([...dates].sort()).toEqual(dates)
        expect(dates.every((d) => d >= f && d <= t)).toBe(true)
        const s = r.summary
        expect(s.moneyOut).toBe(s.spending + s.billsPaid + s.debtPaid)
        expect(s.leftOver).toBe(s.moneyIn - s.moneyOut - (s.savedToFunds - s.takenFromFunds))
        // An entry that paid a bill is never money out on its own (the bill is).
        expect(s.leftOver).toBe(flowsIn(input, { start: f, end: addDays(t, 1) }).net)
        const shares = r.byCategory.reduce((a, c) => a + c.share, 0)
        expect(shares === 0 || shares === 100).toBe(true)
      }),
    )
  })
})
