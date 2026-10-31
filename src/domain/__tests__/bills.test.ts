import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  addedOnMap,
  amountFields,
  billEntriesBetween,
  choiceFromRule,
  dueAgainFields,
  groupByDate,
  groupUpcoming,
  movedFields,
  overridesToCarry,
  paidFields,
  paydayEntriesBetween,
  rebaseRule,
  REPEATS,
  ruleChangeHidesPaid,
  ruleFromChoice,
  ruleHasDate,
  sameRule,
  skippedFields,
  totalsOf,
  type BillEntry,
} from '../bills'
import { fromDayNumber, toDayNumber } from '../dates'
import { expandOccurrences, ruleDates } from '../recurrence'
import type { Bill, BillOccurrence, IncomeSource, Recurrence } from '../types'

const bill = (
  id: string,
  name: string,
  amount: number,
  rule: Recurrence,
  extra: Partial<Bill> = {},
) =>
  ({
    id,
    name,
    amount,
    rule,
    autopay: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }) as Bill

const rent = bill('rent', 'Rent', 95000, {
  freq: 'monthly',
  interval: 1,
  day: 1,
  anchor: '2026-01-01',
})
const phone = bill('phone', 'Phone', 2500, {
  freq: 'monthly',
  interval: 1,
  day: 15,
  anchor: '2026-01-15',
})
const gym = bill(
  'gym',
  'Gym',
  3000,
  { freq: 'weekly', interval: 2, anchor: '2026-10-02' },
  { autopay: true },
)

describe('billEntriesBetween', () => {
  it('merges every bill, sorted by date, with names and override status', () => {
    const overrides: BillOccurrence[] = [
      {
        id: 'rent|2026-11-01',
        billId: 'rent',
        originalDate: '2026-11-01',
        status: 'paid',
        paidAmount: 94000,
      },
      {
        id: 'phone|2026-11-15',
        billId: 'phone',
        originalDate: '2026-11-15',
        status: 'moved',
        movedTo: '2026-11-03',
      },
    ]
    const out = billEntriesBetween([phone, rent, gym], overrides, '2026-11-01', '2026-12-01')
    expect(out.map((e) => [e.date, e.name, e.status, e.amount])).toEqual([
      ['2026-11-01', 'Rent', 'paid', 94000],
      ['2026-11-03', 'Phone', 'due', 2500],
      ['2026-11-13', 'Gym', 'due', 3000],
      ['2026-11-27', 'Gym', 'due', 3000],
    ])
    expect(out[2]!.autopay).toBe(true)
  })

  it('ignores deleted bills and same-day ties sort by name', () => {
    const a = bill('a', 'Water', 100, { freq: 'once', date: '2026-11-05' })
    const b = bill('b', 'Electric', 100, { freq: 'once', date: '2026-11-05' })
    const c = bill(
      'c',
      'Gone',
      100,
      { freq: 'once', date: '2026-11-05' },
      { deletedAt: '2026-10-01T00:00:00Z' },
    )
    expect(
      billEntriesBetween([a, b, c], [], '2026-11-01', '2026-12-01').map((e) => e.name),
    ).toEqual(['Electric', 'Water'])
  })
})

const entry = (
  date: string,
  status: BillEntry['status'],
  amount = 100,
  name = date,
): BillEntry => ({
  billId: name,
  name,
  originalDate: date,
  date,
  amount,
  status,
  moved: false,
  autopay: false,
})

describe('groupUpcoming', () => {
  const period = { start: '2026-10-24', end: '2026-11-07' }
  it.each<[string, BillEntry['status'], keyof ReturnType<typeof groupUpcoming> | null]>([
    ['2026-09-30', 'due', 'overdue'], // before the period, still due
    ['2026-10-25', 'due', 'overdue'], // in the period, before today
    ['2026-10-25', 'paid', 'thisPeriod'], // paid earlier this period: shows progress
    ['2026-10-20', 'paid', null], // paid in an older period
    ['2026-10-31', 'due', 'thisPeriod'], // today
    ['2026-11-06', 'due', 'thisPeriod'],
    ['2026-11-07', 'due', 'later'], // the period end is exclusive
    ['2026-12-06', 'due', 'later'],
    ['2026-12-07', 'due', null], // past laterEnd
    ['2026-11-01', 'skipped', null], // skipped never shows in the list
  ])('%s %s -> %s', (date, status, group) => {
    const g = groupUpcoming([entry(date, status)], '2026-10-31', period, '2026-12-07')
    const found = (Object.keys(g) as (keyof typeof g)[]).filter((k) => g[k].length > 0)
    expect(found).toEqual(group ? [group] : [])
  })
})

describe('groupUpcoming: bills added after their dates', () => {
  it('only counts as overdue from the day the bill was added', () => {
    const entries = [entry('2026-10-01', 'due', 1, 'old'), entry('2026-10-28', 'due', 1, 'old')]
    const g = groupUpcoming(
      entries,
      '2026-10-31',
      { start: '2026-10-30', end: '2026-11-30' },
      '2026-12-31',
      new Map([['old', '2026-10-15']]),
    )
    expect(g.overdue.map((e) => e.date)).toEqual(['2026-10-28'])
    expect(g.thisPeriod).toEqual([])
  })
})

describe('addedOnMap', () => {
  it('maps recurring bills to the day they were added, and leaves one-offs out', () => {
    const at = '2026-10-31T09:00:00.000Z'
    const map = addedOnMap(
      [
        {
          id: 'rent',
          createdAt: at,
          rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
        },
        // Typed in today with last week's date: that's an overdue bill, not history.
        { id: 'fine', createdAt: at, rule: { freq: 'once', date: '2026-10-24' } },
      ],
      (i) => i.slice(0, 10),
    )
    expect([...map]).toEqual([['rent', '2026-10-31']])
  })
})

describe('totalsOf', () => {
  it('counts due and paid separately and ignores skipped', () => {
    expect(
      totalsOf([
        entry('a', 'due', 1000),
        entry('b', 'paid', 250),
        entry('c', 'skipped', 999),
        entry('d', 'due', 5),
      ]),
    ).toEqual({ due: 1005, paid: 250, dueCount: 2, paidCount: 1 })
  })

  it('due + paid equals the sum of the non-skipped amounts', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            status: fc.constantFrom('due', 'paid', 'skipped' as const),
            amount: fc.nat(10 ** 9),
          }),
        ),
        (items) => {
          const t = totalsOf(items as BillEntry[])
          const sum = items.filter((i) => i.status !== 'skipped').reduce((s, i) => s + i.amount, 0)
          expect(t.due + t.paid).toBe(sum)
        },
      ),
    )
  })
})

describe('groupByDate', () => {
  it('keeps order within a day', () => {
    const map = groupByDate([
      entry('2026-11-01', 'due', 1, 'a'),
      entry('2026-11-02', 'due', 1, 'b'),
      entry('2026-11-01', 'due', 1, 'c'),
    ])
    expect([...map.entries()].map(([d, l]) => [d, l.map((e) => e.name)])).toEqual([
      ['2026-11-01', ['a', 'c']],
      ['2026-11-02', ['b']],
    ])
  })
})

describe('paydayEntriesBetween', () => {
  const salary: IncomeSource = {
    id: 'job',
    name: 'Salary',
    amount: 210000,
    schedule: { kind: 'monthly', day: 'last' },
    weekendRule: 'before',
    primary: true,
    active: true,
  }
  const side: IncomeSource = {
    ...salary,
    id: 'side',
    name: 'Side gig',
    amount: 30000,
    primary: false,
    schedule: { kind: 'weekly', anchor: '2026-11-06' },
    weekendRule: 'none',
  }

  it('lists active incomes with weekend shift and overrides applied', () => {
    const out = paydayEntriesBetween(
      [salary, side, { ...side, id: 'old', name: 'Old job', active: false }],
      [{ id: 'side|2026-11-13', incomeId: 'side', originalDate: '2026-11-13', date: '2026-11-12' }],
      '2026-10-25',
      '2026-11-15',
    )
    expect(out.map((p) => [p.date, p.name, p.overridden])).toEqual([
      ['2026-10-30', 'Salary', false], // Sat Oct 31 shifted to Friday
      ['2026-10-30', 'Side gig', false],
      ['2026-11-06', 'Side gig', false],
      ['2026-11-12', 'Side gig', true], // paid early
    ])
  })
})

describe('occurrence override fields', () => {
  it('paying keeps a move and an amount change', () => {
    expect(
      paidFields({ status: 'moved', movedTo: '2026-11-04', amountOverride: 500 }, 450, 'T'),
    ).toEqual({
      status: 'paid',
      movedTo: '2026-11-04',
      amountOverride: 500,
      paidAmount: 450,
      paidAt: 'T',
    })
    expect(paidFields(undefined, 450, 'T', true)).toEqual({
      status: 'paid',
      paidAmount: 450,
      paidAt: 'T',
      auto: true,
    })
  })

  it('skipping drops any earlier payment', () => {
    expect(
      skippedFields({ status: 'paid', paidAmount: 1, paidAt: 'T', movedTo: '2026-11-04' }),
    ).toEqual({
      status: 'skipped',
      movedTo: '2026-11-04',
    })
  })

  it('moving back to the original date removes the move, and the row when nothing is left', () => {
    expect(movedFields(undefined, '2026-11-01', '2026-11-03')).toEqual({
      status: 'moved',
      movedTo: '2026-11-03',
    })
    expect(
      movedFields({ status: 'moved', movedTo: '2026-11-03' }, '2026-11-01', '2026-11-01'),
    ).toBeNull()
    expect(
      movedFields(
        { status: 'paid', paidAmount: 5, movedTo: '2026-11-03' },
        '2026-11-01',
        '2026-11-01',
      ),
    ).toEqual({
      status: 'paid',
      paidAmount: 5,
    })
  })

  it('a single-occurrence amount equal to the bill amount is no override at all', () => {
    expect(amountFields(undefined, 1000, 1200)).toEqual({ status: 'moved', amountOverride: 1200 })
    expect(amountFields({ status: 'moved', amountOverride: 1200 }, 1000, 1000)).toBeNull()
  })

  it('due again keeps adjustments, or clears the row', () => {
    expect(dueAgainFields({ status: 'paid', paidAmount: 5, paidAt: 'T' })).toBeNull()
    expect(dueAgainFields({ status: 'skipped', amountOverride: 7 })).toEqual({
      status: 'moved',
      amountOverride: 7,
    })
  })

  it('expandOccurrences reads an amount-only row as due with the new amount', () => {
    const fields = amountFields(undefined, 95000, 99000)!
    const [occ] = expandOccurrences(rent, '2026-11-01', '2026-11-02', [
      { ...fields, id: 'rent|2026-11-01', billId: 'rent', originalDate: '2026-11-01' },
    ])
    expect(occ).toMatchObject({ status: 'due', amount: 99000, moved: false })
  })
})

describe('ruleFromChoice / choiceFromRule', () => {
  it.each<[Parameters<typeof ruleFromChoice>[0], Recurrence]>([
    [
      { repeat: 'once', start: '2026-11-05', lastDay: false },
      { freq: 'once', date: '2026-11-05' },
    ],
    [
      { repeat: 'weekly', start: '2026-11-06', lastDay: false },
      { freq: 'weekly', interval: 1, anchor: '2026-11-06' },
    ],
    [
      { repeat: 'biweekly', start: '2026-11-06', lastDay: false },
      { freq: 'weekly', interval: 2, anchor: '2026-11-06' },
    ],
    [
      { repeat: 'monthly', start: '2026-01-31', lastDay: false },
      { freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-31' },
    ],
    [
      { repeat: 'monthly', start: '2026-11-30', lastDay: true },
      { freq: 'monthly', interval: 1, day: 'last', anchor: '2026-11-30' },
    ],
    [
      { repeat: 'yearly', start: '2024-02-29', lastDay: false },
      { freq: 'yearly', month: 2, day: 29, start: '2024-02-29' },
    ],
  ])('%j', (choice, rule) => {
    expect(ruleFromChoice(choice)).toEqual(rule)
    expect(choiceFromRule(rule, '2026-10-31')).toMatchObject({ ...choice, exact: true })
  })

  it('flags rules the form cannot show exactly', () => {
    expect(
      choiceFromRule({ freq: 'weekly', interval: 3, anchor: '2026-11-06' }, '2026-10-31').exact,
    ).toBe(false)
    // A "31st" series re-anchored on a clamped Nov 30 by a split.
    expect(
      choiceFromRule({ freq: 'monthly', interval: 1, day: 31, anchor: '2026-11-30' }, '2026-10-31')
        .exact,
    ).toBe(false)
  })

  it('a yearly rule without a start shows this year', () => {
    expect(choiceFromRule({ freq: 'yearly', month: 3, day: 4 }, '2026-10-31').start).toBe(
      '2026-03-04',
    )
  })

  const isoDate = fc
    .integer({ min: toDayNumber('2000-01-01'), max: toDayNumber('2060-12-31') })
    .map(fromDayNumber)

  it('round-trips every choice the form can make', () => {
    fc.assert(
      fc.property(fc.constantFrom(...REPEATS), isoDate, fc.boolean(), (repeat, start, lastDay) => {
        const choice = { repeat, start, lastDay: repeat === 'monthly' && lastDay }
        const rule = ruleFromChoice(choice)
        const back = choiceFromRule(rule, start)
        expect(back.exact).toBe(true)
        expect(sameRule(ruleFromChoice(back), rule)).toBe(true)
        // The first date the rule produces is the chosen start (or that month's last day).
        const b = bill('x', 'X', 1, rule)
        const first = expandOccurrences(b, start, fromDayNumber(toDayNumber(start) + 400))[0]?.date
        if (choice.lastDay) expect(first?.slice(0, 7)).toBe(start.slice(0, 7))
        else expect(first).toBe(start)
      }),
    )
  })

  it('sameRule ignores key order', () => {
    expect(
      sameRule({ freq: 'once', date: '2026-01-01' }, {
        date: '2026-01-01',
        freq: 'once',
      } as Recurrence),
    ).toBe(true)
    expect(
      sameRule({ freq: 'once', date: '2026-01-01' }, { freq: 'once', date: '2026-01-02' }),
    ).toBe(false)
  })
})

describe('rebaseRule', () => {
  it.each<[Recurrence, string, Recurrence]>([
    [
      { freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-31' },
      '2026-11-02',
      { freq: 'monthly', interval: 1, day: 31, anchor: '2026-11-30' },
    ],
    [
      { freq: 'weekly', interval: 2, anchor: '2026-01-02' },
      '2026-11-01',
      { freq: 'weekly', interval: 2, anchor: '2026-11-06' },
    ],
    [
      { freq: 'yearly', month: 3, day: 4, start: '2020-03-04' },
      '2026-11-01',
      { freq: 'yearly', month: 3, day: 4, start: '2027-03-04' },
    ],
    [{ freq: 'once', date: '2026-10-01' }, '2026-11-01', { freq: 'once', date: '2026-11-01' }],
    // Already starting later: untouched.
    [
      { freq: 'weekly', interval: 1, anchor: '2026-12-01' },
      '2026-11-01',
      { freq: 'weekly', interval: 1, anchor: '2026-12-01' },
    ],
  ])('%j from %s', (rule, from, expected) => expect(rebaseRule(rule, from)).toEqual(expected))

  const isoDate = fc
    .integer({ min: toDayNumber('2000-01-01'), max: toDayNumber('2060-12-31') })
    .map(fromDayNumber)
  it('never produces a date before `from`, and keeps every later date', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REPEATS),
        isoDate,
        fc.integer({ min: 0, max: 900 }),
        (repeat, start, gap) => {
          if (repeat === 'once') return
          const rule = ruleFromChoice({ repeat, start, lastDay: false })
          const from = fromDayNumber(toDayNumber(start) + gap)
          const to = fromDayNumber(toDayNumber(from) + 500)
          const b = (r: Recurrence) =>
            expandOccurrences(bill('x', 'X', 1, r), '1999-01-01', to).map((o) => o.date)
          expect(b(rebaseRule(rule, from))).toEqual(b(rule).filter((d) => d >= from))
        },
      ),
    )
  })
})

describe('ruleHasDate', () => {
  const monthly31: Recurrence = { freq: 'monthly', interval: 1, day: 31, anchor: '2026-01-31' }
  it.each([
    [monthly31, '2026-02-28', true], // clamped
    [monthly31, '2026-03-31', true],
    [monthly31, '2026-03-30', false],
    [monthly31, '2025-12-31', false], // before the anchor
    [{ freq: 'weekly', interval: 2, anchor: '2026-11-06' } as Recurrence, '2026-11-20', true],
    [{ freq: 'weekly', interval: 2, anchor: '2026-11-06' } as Recurrence, '2026-11-13', false],
    [{ freq: 'once', date: '2026-11-06' } as Recurrence, '2026-11-06', true],
  ])('%j has %s: %s', (rule, date, expected) => {
    expect(ruleHasDate(rule, date)).toBe(expected)
  })
})

describe('overridesToCarry', () => {
  const row = (
    originalDate: string,
    status: BillOccurrence['status'] = 'paid',
  ): BillOccurrence => ({
    id: `old|${originalDate}`,
    billId: 'old',
    originalDate,
    status,
    paidAmount: 1,
  })
  const rule: Recurrence = { freq: 'monthly', interval: 1, day: 1, anchor: '2026-11-01' }

  it('carries rows from the split on that the new rule still produces', () => {
    const rows = [
      row('2026-10-01'),
      row('2026-11-01'),
      row('2026-12-01', 'skipped'),
      row('2026-12-15'),
    ]
    expect(overridesToCarry(rows, '2026-11-01', { rule }).map((o) => o.originalDate)).toEqual([
      '2026-11-01',
      '2026-12-01',
    ])
  })

  it('stops at the new series until', () => {
    const rows = [row('2026-11-01'), row('2027-01-01')]
    expect(
      overridesToCarry(rows, '2026-11-01', { rule, until: '2026-12-31' }).map(
        (o) => o.originalDate,
      ),
    ).toEqual(['2026-11-01'])
  })

  const isoDate = fc
    .integer({ min: toDayNumber('2020-01-01'), max: toDayNumber('2030-12-31') })
    .map(fromDayNumber)

  it('never carries a row from before the split, and every carried date is real', () => {
    fc.assert(
      fc.property(
        fc.array(isoDate, { maxLength: 12 }),
        isoDate,
        fc.integer({ min: 1, max: 31 }),
        (dates, from, day) => {
          const r: Recurrence = { freq: 'monthly', interval: 1, day, anchor: from }
          for (const o of overridesToCarry(
            dates.map((d) => row(d)),
            from,
            { rule: r },
          )) {
            expect(o.originalDate >= from).toBe(true)
            expect(ruleDates(r, o.originalDate, addDays1(o.originalDate))).toEqual([o.originalDate])
          }
        },
      ),
    )
  })
})

describe('ruleChangeHidesPaid', () => {
  const paid: BillOccurrence = {
    id: 'b|2026-10-15',
    billId: 'b',
    originalDate: '2026-10-15',
    status: 'paid',
    paidAmount: 5000,
  }
  const on = (day: number): Recurrence => ({
    freq: 'monthly',
    interval: 1,
    day,
    anchor: `2026-01-${String(day).padStart(2, '0')}`,
  })
  it.each([
    ['same day keeps the paid row', [paid], on(15), false],
    ['a new day orphans it', [paid], on(20), true],
    ['a skipped row is not history', [{ ...paid, status: 'skipped' as const }], on(20), false],
    ['no rows', [], on(20), false],
  ])('%s', (_, rows, rule, expected) => {
    expect(ruleChangeHidesPaid(rows, rule)).toBe(expected)
  })
})

const addDays1 = (d: string) => fromDayNumber(toDayNumber(d) + 1)
