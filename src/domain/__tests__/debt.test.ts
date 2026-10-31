import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  BALANCE_GUARD,
  compare,
  defaultBudget,
  monthlyInterest,
  negativeAmortization,
  paidShare,
  simulate,
  totalsOverTime,
  type DebtInput,
  type SimulationOk,
} from '../debt'

const ok = (s: ReturnType<typeof simulate>): SimulationOk => {
  if (!s.ok) throw new Error(s.error)
  return s
}

// Textbook case, worked by hand month by month (interest = round(balance × apr / 12)):
//   A €300 at 12% (1%/month), B €600 at 24% (2%/month), both €50 minimum, €200 budget.
// Avalanche (B first):
//   m1 A 30000+300 → 25300   B 60000+1200 → 56200 → extra 10000 → 46200
//   m2 A 25300+253 → 20553   B 46200+924  → 42124 → 32124
//   m3 A 20553+206 → 15759   B 32124+642  → 27766 → 17766
//   m4 A 15759+158 → 10917   B 17766+355  → 13121 → 3121
//   m5 A 10917+109 → 6026    B 3121+62 → 0 (min 3183), pool 11817 → A 0, 5791 left over
//   interest 300+1200+253+924+206+642+158+355+109+62 = 4209
// Snowball (A first, smaller balance):
//   m1 A 30300 → 25300 → 15300           B 61200 → 56200
//   m2 A 15453 → 10453 → 453             B 57324 → 52324
//   m3 A 458 → 0 (min), pool 14542 → B   B 53370 → 48370 → 33828
//   m4 B 34505 → 29505 → 14505
//   m5 B 14795 → 9795 → 0
//   interest 300+1200+153+1124+5+1046+677+290 = 4795
const A: DebtInput = { id: 'A', balance: 30000, aprBps: 1200, minPayment: 5000 }
const B: DebtInput = { id: 'B', balance: 60000, aprBps: 2400, minPayment: 5000 }

describe('simulate (PLAN §4.3)', () => {
  it('matches the hand-computed avalanche fixture', () => {
    const s = ok(simulate([A, B], 20000, 'avalanche'))
    expect(s.months).toBe(5)
    expect(s.paidOff).toBe(true)
    expect(s.totalInterest).toBe(4209)
    expect(s.payoffOrder).toEqual([
      { id: 'B', month: 5 },
      { id: 'A', month: 5 },
    ])
    expect(s.schedule).toEqual([
      [30000, 60000],
      [25300, 46200],
      [20553, 32124],
      [15759, 17766],
      [10917, 3121],
      [0, 0],
    ])
  })

  it('matches the hand-computed snowball fixture', () => {
    const s = ok(simulate([A, B], 20000, 'snowball'))
    expect(s.months).toBe(5)
    expect(s.totalInterest).toBe(4795)
    expect(s.payoffOrder).toEqual([
      { id: 'A', month: 3 },
      { id: 'B', month: 5 },
    ])
    expect(s.schedule.map((r) => r[1])).toEqual([60000, 56200, 52324, 33828, 14505, 0])
  })

  it('compare reports what avalanche saves', () => {
    const c = compare([A, B], 20000)
    if ('error' in c) throw new Error(c.error)
    expect(c.interestSaved).toBe(4795 - 4209)
    expect(c.monthsDiff).toBe(0)
  })

  it('zero APR: no interest, every cent of the budget goes to principal', () => {
    const debts = [
      { id: 'x', balance: 10000, aprBps: 0, minPayment: 1000 },
      { id: 'y', balance: 5000, aprBps: 0, minPayment: 1000 },
    ]
    for (const strategy of ['snowball', 'avalanche'] as const) {
      const s = ok(simulate(debts, 3000, strategy))
      expect(s.totalInterest).toBe(0)
      expect(s.months).toBe(5) // 15000 / 3000
      // Equal APR: avalanche falls back to the smaller balance, like snowball.
      expect(s.payoffOrder.map((p) => p.id)).toEqual(['y', 'x'])
    }
  })

  it('single debt with the budget exactly equal to the minimum', () => {
    // 10000 at 1%/month, 2000 a month: interest 100, 81, 62, 42, 23, 3.
    const s = ok(
      simulate([{ id: 'c', balance: 10000, aprBps: 1200, minPayment: 2000 }], 2000, 'avalanche'),
    )
    expect(s.months).toBe(6)
    expect(s.totalInterest).toBe(311)
    expect(s.schedule.map((r) => r[0])).toEqual([10000, 8100, 6181, 4243, 2285, 308, 0])
  })

  it('budget == sum of minimums is allowed; one cent less is an error', () => {
    expect(simulate([A, B], 10000, 'snowball').ok).toBe(true)
    expect(simulate([A, B], 9999, 'snowball')).toEqual({
      ok: false,
      error: 'budget_below_minimums',
      minimums: 10000,
    })
    expect(compare([A, B], 9999)).toMatchObject({ error: 'budget_below_minimums' })
  })

  it('a debt already at zero adds no minimum and no month', () => {
    const done = { id: 'z', balance: 0, aprBps: 2000, minPayment: 9000 }
    const s = ok(simulate([done, A], 5000, 'snowball'))
    expect(s.payoffOrder.map((p) => p.id)).toEqual(['A'])
    expect(ok(simulate([done], 0, 'snowball')).months).toBe(0)
  })

  it('negative amortization: flagged, and the minimum alone never pays it off', () => {
    const loan = { id: 'n', balance: 100000, aprBps: 2400, minPayment: 1500 } // interest 2000
    expect(negativeAmortization([loan, A]).map((d) => d.id)).toEqual(['n'])
    expect(negativeAmortization([{ ...loan, minPayment: 2000 }])).toHaveLength(1) // equal counts
    expect(negativeAmortization([{ ...loan, minPayment: 2001 }])).toHaveLength(0)

    const stuck = ok(simulate([loan], 1500, 'avalanche', 120))
    expect(stuck.paidOff).toBe(false)
    expect(stuck.months).toBe(120)
    expect(stuck.schedule.at(-1)![0]).toBeGreaterThan(loan.balance)

    // Enough extra on top still clears it.
    expect(ok(simulate([loan], 5000, 'avalanche')).paidOff).toBe(true)
  })

  it.each([
    // Snowball tie on balance (both 5100 after interest): higher APR first.
    [
      'snowball',
      [
        { id: 'p', balance: 5100, aprBps: 0 },
        { id: 'q', balance: 5000, aprBps: 2400 },
      ],
      ['q', 'p'],
    ],
    // Avalanche tie on APR: smaller balance first.
    [
      'avalanche',
      [
        { id: 'p', balance: 9000, aprBps: 1500 },
        { id: 'q', balance: 4000, aprBps: 1500 },
      ],
      ['q', 'p'],
    ],
    // Full tie: input order.
    [
      'snowball',
      [
        { id: 'p', balance: 5000, aprBps: 0 },
        { id: 'q', balance: 5000, aprBps: 0 },
      ],
      ['p', 'q'],
    ],
    [
      'avalanche',
      [
        { id: 'p', balance: 5000, aprBps: 0 },
        { id: 'q', balance: 5000, aprBps: 0 },
      ],
      ['p', 'q'],
    ],
  ] as const)('%s tie-break %#', (strategy, rows, expected) => {
    const debts = rows.map((r) => ({ ...r, minPayment: 100 }))
    const s = ok(simulate(debts, 3000, strategy))
    expect(s.payoffOrder.map((p) => p.id)).toEqual(expected)
  })

  it('focus is where the extra goes first, not the debt that happens to finish first', () => {
    expect(ok(simulate([A, B], 20000, 'avalanche')).focus).toBe('B')
    expect(ok(simulate([A, B], 20000, 'snowball')).focus).toBe('A')
    // Budget == minimums: there is no extra to focus.
    expect(ok(simulate([A, B], 10000, 'avalanche')).focus).toBeNull()

    // A small 0% debt with a big minimum clears in month 1 on its minimum alone, while the
    // extra goes to the 20% loan. "Focus first" must point at the loan.
    const small = { id: 'small', balance: 10000, aprBps: 0, minPayment: 10000 }
    const loan = { id: 'loan', balance: 100000, aprBps: 2000, minPayment: 2000 }
    const s = ok(simulate([small, loan], 15000, 'avalanche'))
    expect(s.payoffOrder[0]).toEqual({ id: 'small', month: 1 })
    expect(s.focus).toBe('loan')
  })

  it('stops at the size guard instead of growing past safe integers', () => {
    // 1000% APR on a 1-cent minimum: interest outruns the budget forever.
    const runaway = { id: 'r', balance: 1_000_000, aprBps: 100_000, minPayment: 1 }
    const s = ok(simulate([runaway], 1, 'avalanche'))
    expect(s.paidOff).toBe(false)
    expect(s.months).toBeLessThan(600)
    expect(s.schedule.at(-2)![0]).toBeLessThanOrEqual(BALANCE_GUARD)
    for (const row of s.schedule) for (const b of row) expect(Number.isSafeInteger(b)).toBe(true)
    expect(Number.isSafeInteger(s.totalInterest)).toBe(true)
  })

  it('interest rounds half up per debt per month (the only rounding point)', () => {
    expect(monthlyInterest(10000, 1200)).toBe(100)
    expect(monthlyInterest(15453, 1200)).toBe(155) // 154.53
    expect(monthlyInterest(45, 1200)).toBe(0) // 0.45
    expect(monthlyInterest(50, 1200)).toBe(1) // 0.5
  })

  const debtArb = fc.record({
    id: fc.uuid(),
    balance: fc.integer({ min: 0, max: 5_000_000 }),
    aprBps: fc.integer({ min: 0, max: 3500 }),
    minPayment: fc.integer({ min: 0, max: 50_000 }),
  })

  it('conserves money: everything paid = starting balances + interest - what is left', () => {
    fc.assert(
      fc.property(
        fc.array(debtArb, { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 0, max: 200_000 }),
        fc.constantFrom('snowball' as const, 'avalanche' as const),
        (debts, extra, strategy) => {
          const budget = defaultBudget(debts, extra)
          const s = ok(simulate(debts, budget, strategy, 240))
          const start = debts.reduce((t, d) => t + d.balance, 0)
          const end = totalsOverTime(s).at(-1)!
          for (const row of s.schedule) for (const b of row) expect(b).toBeGreaterThanOrEqual(0)
          // Never pays more than the budget in a month.
          expect(start + s.totalInterest - end).toBeLessThanOrEqual(budget * s.months)
          expect(Number.isInteger(s.totalInterest)).toBe(true)
          expect(s.schedule).toHaveLength(s.months + 1)
          if (s.paidOff) expect(end).toBe(0)
        },
      ),
    )
  })
})

describe('simulate properties', () => {
  const debtArb = fc.record({
    id: fc.uuid(),
    balance: fc.integer({ min: 0, max: 5_000_000 }),
    aprBps: fc.integer({ min: 0, max: 100_000 }),
    minPayment: fc.integer({ min: 0, max: 50_000 }),
  })

  it('each month: interest first, then at most the budget paid, never below zero', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(debtArb, { minLength: 1, maxLength: 6, selector: (d) => d.id }),
        fc.integer({ min: 0, max: 200_000 }),
        fc.constantFrom('snowball' as const, 'avalanche' as const),
        (debts, extra, strategy) => {
          const budget = defaultBudget(debts, extra)
          const s = ok(simulate(debts, budget, strategy, 120))
          let interest = 0
          for (let m = 1; m < s.schedule.length; m++) {
            const prev = s.schedule[m - 1]!
            const row = s.schedule[m]!
            let paid = 0
            row.forEach((b, i) => {
              expect(b).toBeGreaterThanOrEqual(0)
              const charged = prev[i]! > 0 ? monthlyInterest(prev[i]!, debts[i]!.aprBps) : 0
              interest += charged
              paid += prev[i]! + charged - b
              expect(prev[i]! + charged - b).toBeGreaterThanOrEqual(0)
            })
            expect(paid).toBeLessThanOrEqual(budget)
          }
          expect(interest).toBe(s.totalInterest)
          // Each debt is listed once, in the month its balance first hit zero.
          for (const { id, month } of s.payoffOrder) {
            const i = debts.findIndex((d) => d.id === id)
            expect(s.schedule[month]![i]).toBe(0)
            expect(s.schedule[month - 1]![i]).toBeGreaterThan(0)
          }
          expect(new Set(s.payoffOrder.map((p) => p.id)).size).toBe(s.payoffOrder.length)
        },
      ),
    )
  })
})

describe('paidShare', () => {
  it.each([
    [5000, 10000, 0.5],
    [0, 10000, 1],
    [12000, 10000, 0], // grew past the start: clamp, never negative
    [0, 0, 1],
  ])('balance %i of %i -> %f', (balance, original, share) => {
    expect(paidShare(balance, original)).toBe(share)
  })
})
