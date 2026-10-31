// "Look around with sample data" (PLAN §7): one calm, believable household, built
// relative to TODAY so the demo never shows stale dates. buildDemoData is pure (dates and
// the clock are parameters), which is what the tests check; seedDemo writes it.
import { addDays, addMonths, isWeekend, parseISODate } from '../../domain/dates'
import { challengeTotal } from '../../domain/savings'
import { withDefaults, type Settings } from '../../domain/settings'
import type {
  BalanceCheckIn,
  Bill,
  BillOccurrence,
  Debt,
  ImpulseItem,
  IncomeSource,
  ISODate,
  NoSpendDay,
  SavingsFund,
  Transaction,
} from '../../domain/types'
import { occurrenceId } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import type { DemoState } from '../demo'
import { resetDemo } from '../demo'
import { db, type RowTypes } from '../schema'

export interface DemoData {
  incomes: IncomeSource[]
  bills: Bill[]
  billOccurrences: BillOccurrence[]
  transactions: Transaction[]
  checkIns: BalanceCheckIn[]
  funds: SavingsFund[]
  debts: Debt[]
  impulse: ImpulseItem[]
  noSpend: NoSpendDay[]
  gardenPoints: number
}

const HOUR = 3_600_000

export const SEEDED_TABLES = [
  'incomes',
  'bills',
  'billOccurrences',
  'transactions',
  'checkIns',
  'funds',
  'debts',
  'impulse',
  'noSpend',
] as const satisfies readonly (keyof DemoData)[]

/**
 * @param today the local calendar day
 * @param now   the current instant (for "added 10 hours ago" and today's entries)
 * @param decimals the currency's minor-unit digits, so €12.50 stays "12.50" in any currency
 */
export function buildDemoData(today: ISODate, now: Date, decimals = 2): DemoData {
  const money = (major: number) => Math.round(major * 10 ** decimals)
  const day = (offset: number) => addDays(today, offset)
  // A local wall-clock time on a calendar day, as an instant.
  const at = (date: ISODate, hour: number, minute = 0) => {
    const { year, month, day: d } = parseISODate(date)
    return new Date(year, month - 1, d, hour, minute).toISOString()
  }
  // Monthly bills avoid the 29th-31st, so every month has the same due day.
  const dueNear = (offset: number) => {
    let date = day(offset)
    while (parseISODate(date).day > 28) date = addDays(date, offset < 0 ? -1 : 1)
    return date
  }
  const setUpOn = at(day(-40), 19)

  // Paid every other week; last payday a few weekdays ago.
  let lastPayday = day(-5)
  while (isWeekend(lastPayday)) lastPayday = addDays(lastPayday, -1)
  const incomes: IncomeSource[] = [
    {
      id: 'demo-pay',
      name: 'Pay',
      amount: money(1640),
      schedule: { kind: 'biweekly', anchor: lastPayday },
      weekendRule: 'before',
      primary: true,
      active: true,
    },
  ]

  const checkIns: BalanceCheckIn[] = [
    { id: 'demo-checkin-1', at: at(lastPayday, 18), date: lastPayday, balance: money(2105.4) },
    { id: 'demo-checkin-2', at: at(day(-1), 21), date: day(-1), balance: money(1486.2) },
  ]
  const lastCheckIn = checkIns[1]!

  const bills: Bill[] = []
  const billOccurrences: BillOccurrence[] = []
  function bill(id: string, name: string, amount: number, offset: number, autopay: boolean) {
    const due = dueNear(offset)
    const { day: dom } = parseISODate(due)
    const row: Bill = {
      id: `demo-bill-${id}`,
      name,
      amount: money(amount),
      // Anchored on this occurrence: no earlier month exists to show up as "overdue".
      rule: { freq: 'monthly', interval: 1, day: dom, anchor: due },
      autopay,
      createdAt: setUpOn,
    }
    bills.push(row)
    // Past ones are paid, before the last check-in, so they're already in that balance.
    if (due < today) {
      billOccurrences.push({
        id: occurrenceId(row.id, due),
        billId: row.id,
        originalDate: due,
        status: 'paid',
        paidAmount: row.amount,
        paidAt: due < lastCheckIn.date ? at(due, 9) : at(lastCheckIn.date, 20),
        ...(autopay ? { auto: true } : {}),
      })
    }
    return row
  }
  bill('rent', 'Rent', 950, -4, false)
  bill('streaming', 'Streaming', 12.99, -8, true)
  bill('gym', 'Gym', 29, -2, true)
  bill('phone', 'Phone', 25, 3, true)
  bill('insurance', 'Home insurance', 38.5, 6, false)
  bill('electricity', 'Electricity', 64, 10, false)

  // Two debts, each with its linked minimum-payment bill (as addDebt would make them).
  const balanceAsOf = day(-10)
  const debts: Debt[] = []
  function debt(id: string, d: Omit<Debt, 'id' | 'balanceAsOf' | 'dueDay'>, dueOffset: number) {
    const due = dueNear(dueOffset)
    const row: Debt = { ...d, id: `demo-debt-${id}`, balanceAsOf, dueDay: parseISODate(due).day }
    debts.push(row)
    const min: Bill = {
      id: `demo-bill-${id}-min`,
      name: row.name,
      amount: row.minPayment,
      rule: { freq: 'monthly', interval: 1, day: row.dueDay, anchor: balanceAsOf },
      debtId: row.id,
      autopay: false,
      createdAt: setUpOn,
    }
    bills.push(min)
    if (due < today) {
      billOccurrences.push({
        id: occurrenceId(min.id, due),
        billId: min.id,
        originalDate: due,
        status: 'paid',
        paidAmount: min.amount,
        paidAt: due < lastCheckIn.date ? at(due, 9) : at(lastCheckIn.date, 20),
      })
    }
  }
  debt(
    'card',
    {
      name: 'Credit card',
      balance: money(1240),
      originalBalance: money(1850),
      aprBps: 2190,
      minPayment: money(35),
    },
    8,
  )
  debt(
    'car',
    {
      name: 'Car loan',
      balance: money(6420),
      originalBalance: money(9000),
      aprBps: 590,
      minPayment: money(168),
    },
    -3,
  )

  const unit = money(1)
  const funds: SavingsFund[] = [
    {
      id: 'demo-fund-holiday',
      name: 'Summer holiday',
      target: money(600),
      targetDate: addMonths(today, 5),
      perPeriod: money(40),
      openingSaved: money(150),
    },
    {
      id: 'demo-fund-52',
      name: '52-week challenge',
      target: challengeTotal(unit),
      perPeriod: 0,
      // Weeks 1-4 already put away: 1 + 2 + 3 + 4.
      openingSaved: unit * 10,
      challenge: { kind: '52week', start: day(-31) },
    },
  ]

  // A few days with no spending, marked; the spending list below leaves them empty.
  const noSpendOffsets = [-9, -6, -3]
  const noSpend: NoSpendDay[] = noSpendOffsets.map((o) => ({ date: day(o) }))

  const spending: [offset: number, note: string, amount: number][] = [
    [-13, 'Groceries', 46.8],
    [-13, 'Coffee', 3.2],
    [-12, 'Lunch', 9.5],
    [-12, 'Bus', 2.4],
    [-11, 'Pharmacy', 12.35],
    [-11, 'Coffee', 3.2],
    [-10, 'Takeaway', 18.9],
    [-10, 'Snacks', 4.1],
    [-8, 'Groceries', 38.15],
    [-8, 'Bus', 2.8],
    [-7, 'Coffee', 3.2],
    [-7, 'Books', 14.99],
    [-5, 'Groceries', 52.4],
    [-5, 'Dinner out', 27],
    [-4, 'Coffee', 3.2],
    [-4, 'Petrol', 45],
    [-2, 'Lunch', 8.7],
    [-2, 'Haircut', 22],
    [-1, 'Groceries', 31.6],
    [-1, 'Coffee', 3.4],
    [-1, 'Cinema', 11.5],
    [0, 'Coffee', 3.2],
    [0, 'Lunch', 9.8],
  ]
  const transactions: Transaction[] = []
  let todayCount = 0
  for (const [i, [offset, note, amount]] of spending.entries()) {
    const date = day(offset)
    // Earlier days: entered that day, before the last check-in (already in its balance).
    // Today: entered after it and before now, so today's number already counts them.
    const createdAt =
      offset < 0
        ? at(date, 8 + (i % 4) * 3)
        : new Date(now.getTime() - (++todayCount * 7 + 1) * 60_000).toISOString()
    transactions.push({
      id: `demo-tx-${i + 1}`,
      date,
      amount: -money(amount),
      note,
      createdAt,
    })
  }
  // Moves into savings: they leave the balance but are saving, not spending.
  transactions.push(
    {
      id: 'demo-tx-holiday',
      date: lastPayday,
      amount: -money(40),
      note: 'Summer holiday',
      fundId: 'demo-fund-holiday',
      createdAt: at(lastPayday, 17),
    },
    {
      id: 'demo-tx-52',
      date: day(-2),
      amount: -unit * 5,
      note: '52-week challenge',
      fundId: 'demo-fund-52',
      createdAt: at(day(-2), 19),
    },
  )

  const impulse: ImpulseItem[] = [
    {
      id: 'demo-wait-headphones',
      name: 'Headphones',
      amount: money(89),
      addedAt: new Date(now.getTime() - 10 * HOUR).toISOString(),
    },
    {
      // Added three days ago: its 48 hours are up, so the demo shows the "decide" card.
      id: 'demo-wait-jacket',
      name: 'Rain jacket',
      amount: money(65),
      addedAt: new Date(now.getTime() - 72 * HOUR).toISOString(),
    },
  ]

  return {
    incomes,
    bills,
    billOccurrences,
    transactions,
    checkIns,
    funds,
    debts,
    impulse,
    noSpend,
    gardenPoints: 14,
  }
}

/**
 * Replaces whatever is in the demo database with the sample household, finished setup
 * included, in one transaction. Settings keep the device's locale and currency; Full
 * mode is on so every tab has something to show.
 */
export async function seedDemo(now: Date = new Date()): Promise<void> {
  const previous = withDefaults(
    (await db.meta.get('settings'))?.value as Partial<Settings> | undefined,
  )
  await resetDemo()
  const today = todayISO(now)
  const data = buildDemoData(today, now, previous.decimals)
  const stamp = now.toISOString()
  const demo: DemoState = { startedAt: stamp, kind: 'sample', entries: 0 }
  const meta: RowTypes['meta'][] = [
    { key: 'settings', value: { ...previous, simpleMode: false } satisfies Settings },
    { key: 'setupProgress', value: { step: 'done', ackAt: stamp, doneAt: stamp } },
    { key: 'lastOpened', value: today },
    { key: 'gardenPoints', value: data.gardenPoints },
    { key: 'demo', value: demo },
  ]
  await db.transaction('rw', db.tables, async () => {
    for (const table of SEEDED_TABLES) await db.table(table).bulkPut(data[table])
    await db.meta.bulkPut(meta)
  })
}
