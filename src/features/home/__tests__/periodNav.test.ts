import { describe, expect, it } from 'vitest'
import type { TodayInput } from '../../../domain/today'
import type { IncomeSource, Transaction } from '../../../domain/types'
import { firstTrackedDay, periodNav } from '../periodNav'

const TODAY = '2026-11-04'

function input(over: Partial<TodayInput> = {}): TodayInput {
  return {
    today: TODAY,
    money: { planBy: 'month', startingBalance: 0, startDate: TODAY, rollover: false },
    incomes: [],
    paydayOverrides: [],
    bills: [],
    occurrences: [],
    transactions: [],
    ...over,
  }
}

const irregular = (expected: string[]): IncomeSource => ({
  id: 'pay',
  name: 'Pay',
  amount: 100000,
  schedule: { kind: 'irregular', expected },
  weekendRule: 'none',
  primary: true,
  active: true,
})

const spend = (date: string, deletedAt?: string): Transaction => ({
  id: date,
  date,
  amount: -500,
  note: 'x',
  createdAt: `${date}T09:00:00.000Z`,
  ...(deletedAt ? { deletedAt } : {}),
})

describe('firstTrackedDay', () => {
  it('is the start date, or an older live entry', () => {
    expect(firstTrackedDay(input(), TODAY)).toBe(TODAY)
    expect(firstTrackedDay(input({ transactions: [spend('2026-09-12')] }), TODAY)).toBe(
      '2026-09-12',
    )
    const gone = spend('2026-08-01', '2026-11-01T09:00:00.000Z')
    expect(firstTrackedDay(input({ transactions: [gone] }), TODAY)).toBe(TODAY)
  })
})

describe('periodNav by month', () => {
  it('stops at the first month with anything tracked, and always has a next month', () => {
    const nav = periodNav(input(), TODAY, TODAY)
    expect(nav.span).toEqual({ start: '2026-11-01', end: '2026-12-01' })
    expect(nav.prev).toBeNull()
    expect(nav.next).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })

  it('goes back as far as the oldest entry', () => {
    const data = input({ transactions: [spend('2026-09-30')] })
    expect(periodNav(data, TODAY, TODAY).prev).toEqual({ start: '2026-10-01', end: '2026-11-01' })
    expect(periodNav(data, '2026-10-15', TODAY).prev?.start).toBe('2026-09-01')
    expect(periodNav(data, '2026-09-15', TODAY).prev).toBeNull()
  })
})

describe('periodNav by pay period, irregular income', () => {
  const money = { planBy: 'payday' as const, startingBalance: 0, startDate: TODAY, rollover: false }

  it('before the first payday: nothing to step back to, one real period ahead', () => {
    const data = input({ money, incomes: [irregular(['2026-11-20', '2026-12-04'])] })
    const nav = periodNav(data, TODAY, TODAY)
    expect(nav.span).toEqual({ start: TODAY, end: '2026-11-20' })
    expect(nav.prev).toBeNull()
    expect(nav.next).toEqual({ start: '2026-11-20', end: '2026-12-04' })
  })

  it('from the first pay period, Previous is the stretch from today, not one day back', () => {
    const data = input({ money, incomes: [irregular(['2026-11-20', '2026-12-04'])] })
    const nav = periodNav(data, '2026-11-20', TODAY)
    expect(nav.prev).toEqual({ start: TODAY, end: '2026-11-20' })
    // No payday after 4 Dec: no period to go to.
    expect(nav.next).toBeNull()
  })

  it('with no payday framing the date, there is no period and no way on', () => {
    const data = input({ money, incomes: [irregular(['2026-11-20'])] })
    expect(periodNav(data, '2026-11-25', TODAY)).toEqual({ span: null, prev: null, next: null })
  })
})
