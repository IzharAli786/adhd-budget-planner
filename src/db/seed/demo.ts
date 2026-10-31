// "Look around with sample data" (PLAN §7): one calm, believable household, built
// relative to TODAY so the demo never shows stale dates. buildDemoData is pure (dates and
// the clock are parameters), which is what the tests check; seedDemo writes it.
//
// It carries about nine months of history (paydays, paid bills, tagged spending, savings
// and debt payments, a check-in every payday), so Insights, Look back and the carry-over
// have something real to show. None of it counts toward the demo's 25 entries: seedDemo
// writes the rows directly, never through the capped repos.
import { billEntriesBetween } from '../../domain/bills'
import { STARTER_CATEGORIES } from '../../domain/categories'
import { addDays, addMonths, isWeekend, makeDate, parseISODate } from '../../domain/dates'
import { gardenPoints } from '../../domain/garden'
import { challengeTotal } from '../../domain/savings'
import { withDefaults, type Settings } from '../../domain/settings'
import type {
  BalanceCheckIn,
  Bill,
  BillOccurrence,
  Debt,
  Envelope,
  ImpulseItem,
  IncomeSource,
  ISODate,
  NoSpendDay,
  LifeGoal,
  Note,
  SavingsFund,
  Transaction,
} from '../../domain/types'
import { noteId, occurrenceId } from '../../domain/types'
import { todayISO } from '../../lib/clock'
import { detectLocaleDefaults } from '../../lib/locale'
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
  envelopes: Envelope[]
  notes: Note[]
  lifeGoals: LifeGoal[]
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
  'envelopes',
  'notes',
  'lifeGoals',
] as const satisfies readonly (keyof DemoData)[]

/** Pay periods of history before the current one: about nine months, so Look back has a
 *  year that reads like one and Insights has past periods to step back through. */
export const DEMO_PAST_PERIODS = 19

// A small seeded generator (mulberry32), so the household is the same on every visit and
// in tests while its spending still looks real and uneven.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Spend = readonly [note: string, min: number, max: number]
/** What everyday spending looks like: a category, how often it comes up, typical prices. */
const SPENDS: readonly { category?: string; weight: number; kinds: readonly Spend[] }[] = [
  {
    category: 'Groceries',
    weight: 30,
    kinds: [
      ['Groceries', 32, 95],
      ['Market', 12, 30],
    ],
  },
  {
    category: 'Eating out',
    weight: 30,
    kinds: [
      ['Coffee', 2.8, 4.2],
      ['Lunch', 7.5, 13],
      ['Takeaway', 15, 27],
      ['Dinner out', 26, 52],
    ],
  },
  {
    category: 'Transport',
    weight: 18,
    kinds: [
      ['Bus', 2.4, 2.8],
      ['Petrol', 40, 62],
      ['Train', 7, 19],
    ],
  },
  {
    category: 'Fun',
    weight: 9,
    kinds: [
      ['Cinema', 10, 14],
      ['Books', 9, 24],
      ['Concert', 28, 55],
    ],
  },
  {
    category: 'Personal care',
    weight: 6,
    kinds: [
      ['Pharmacy', 6, 22],
      ['Haircut', 18, 28],
    ],
  },
  { category: 'Gifts', weight: 4, kinds: [['Gift', 15, 45]] },
  { category: 'Other', weight: 5, kinds: [['Hardware shop', 6, 24]] },
  // Untagged: lands in Everyday, as an untagged entry does in the app.
  { weight: 6, kinds: [['Snacks', 2, 6]] },
]
const SPEND_WEIGHT = SPENDS.reduce((a, s) => a + s.weight, 0)

// Per-pay-period budgets on the categories everyday spending goes into. The bill
// categories stay at 0 ("no budget yet"): their bills are planned on the calendar.
const BUDGETS: Record<string, number> = {
  Groceries: 200,
  'Eating out': 90,
  Transport: 90,
  Fun: 40,
  'Personal care': 30,
  Gifts: 30,
  Other: 25,
}

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

  // Paid every other week; last payday a few weekdays ago, with nine months of paydays
  // before it. Steps of 14 days keep every one on the same weekday.
  let lastPayday = day(-5)
  while (isWeekend(lastPayday)) lastPayday = addDays(lastPayday, -1)
  const paydays = Array.from({ length: DEMO_PAST_PERIODS + 1 }, (_, i) =>
    addDays(lastPayday, -14 * (DEMO_PAST_PERIODS - i)),
  )
  const historyStart = paydays[0]!
  const setUpOn = at(addDays(historyStart, -1), 19)
  const pay = money(1125)
  const incomes: IncomeSource[] = [
    {
      id: 'demo-pay',
      name: 'Pay',
      amount: pay,
      schedule: { kind: 'biweekly', anchor: lastPayday },
      weekendRule: 'before',
      primary: true,
      active: true,
    },
  ]

  // The "common categories" set, as one tap in Plan makes it, plus Everyday, with budgets
  // on the everyday ones so Insights can show planned against actual.
  const envelopes: Envelope[] = [
    {
      id: 'demo-env-everyday',
      name: 'Everyday',
      budget: 0,
      isDefault: true,
      color: 'accent',
      sort: 0,
    },
    ...STARTER_CATEGORIES.map((c, i) => ({
      id: `demo-env-${i + 1}`,
      name: c.name,
      budget: money(BUDGETS[c.name] ?? 0),
      isDefault: false,
      color: c.color,
      sort: i + 1,
    })),
  ]
  const env = (name: string) => envelopes.find((e) => e.name === name)!.id

  // Every past occurrence is paid on its day, so nothing shows as overdue and the paid
  // bills fill Insights and Look back.
  const bills: Bill[] = []
  const billOccurrences: BillOccurrence[] = []
  const firstOnOrAfter = (from: ISODate, dom: number) => {
    const { year, month } = parseISODate(from)
    const date = makeDate(year, month, dom)
    return date >= from ? date : addMonths(date, 1)
  }
  function monthly(row: Omit<Bill, 'rule' | 'createdAt'>, dom: number) {
    const bill: Bill = {
      ...row,
      rule: { freq: 'monthly', interval: 1, day: dom, anchor: firstOnOrAfter(historyStart, dom) },
      createdAt: setUpOn,
    }
    bills.push(bill)
    for (const e of billEntriesBetween([bill], [], historyStart, today))
      billOccurrences.push({
        id: occurrenceId(bill.id, e.originalDate),
        billId: bill.id,
        originalDate: e.originalDate,
        status: 'paid',
        paidAmount: bill.amount,
        paidAt: at(e.originalDate, 9),
        ...(bill.autopay ? { auto: true } : {}),
      })
  }
  function bill(
    id: string,
    name: string,
    amount: number,
    offset: number,
    autopay: boolean,
    category: string,
  ) {
    const dom = parseISODate(dueNear(offset)).day
    monthly(
      { id: `demo-bill-${id}`, name, amount: money(amount), autopay, envelopeId: env(category) },
      dom,
    )
  }
  bill('rent', 'Rent', 1100, -4, false, 'Rent & housing')
  bill('streaming', 'Streaming', 12.99, -8, true, 'Subscriptions')
  bill('gym', 'Gym', 29, -2, true, 'Subscriptions')
  bill('phone', 'Phone', 25, 3, true, 'Bills & utilities')
  bill('insurance', 'Home insurance', 38.5, 6, false, 'Bills & utilities')
  bill('electricity', 'Electricity', 64, 10, false, 'Bills & utilities')
  bill('internet', 'Internet', 35, 12, true, 'Bills & utilities')

  // Two debts, each with its linked minimum-payment bill (as addDebt would make them).
  const balanceAsOf = day(-10)
  const debts: Debt[] = []
  function debt(id: string, d: Omit<Debt, 'id' | 'balanceAsOf' | 'dueDay'>, dueOffset: number) {
    const dueDay = parseISODate(dueNear(dueOffset)).day
    const row: Debt = { ...d, id: `demo-debt-${id}`, balanceAsOf, dueDay }
    debts.push(row)
    monthly(
      {
        id: `demo-bill-${id}-min`,
        name: row.name,
        amount: row.minPayment,
        debtId: row.id,
        autopay: false,
      },
      dueDay,
    )
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
      target: money(1200),
      targetDate: addMonths(today, 5),
      perPeriod: money(40),
      openingSaved: 0,
    },
    {
      id: 'demo-fund-52',
      name: '52-week challenge',
      target: challengeTotal(unit),
      perPeriod: 0,
      openingSaved: 0,
      challenge: { kind: '52week', start: historyStart },
    },
  ]

  const transactions: Transaction[] = []
  // On every payday: the holiday's 40, and the challenge's last two weeks (weeks 2j-1 and
  // 2j ask for 4j-1 units together). Now and then a little extra on the card, never in
  // this period (a debt payment there would read as Everyday spending on Today).
  for (const [j, date] of paydays.entries()) {
    transactions.push({
      id: `demo-tx-holiday-${j + 1}`,
      date,
      amount: -money(40),
      note: 'Summer holiday',
      fundId: 'demo-fund-holiday',
      createdAt: at(date, 17),
    })
    if (j > 0)
      transactions.push({
        id: `demo-tx-52-${j}`,
        date,
        amount: -unit * (4 * j - 1),
        note: '52-week challenge',
        fundId: 'demo-fund-52',
        createdAt: at(date, 17, 5),
      })
    if (j % 4 === 2 && j < DEMO_PAST_PERIODS) {
      const next = addDays(date, 1)
      transactions.push({
        id: `demo-tx-card-${j}`,
        date: next,
        amount: -money(50),
        note: 'Extra on the card',
        debtId: 'demo-debt-card',
        createdAt: at(next, 12),
      })
    }
  }

  // Everyday spending before the last two weeks: 9 to 14 entries a pay period across its
  // days, tagged into the common categories (a few left untagged, as people do).
  const random = rng(20261031)
  const handFrom = day(-13)
  let n = 0
  for (const start of paydays.slice(0, -1)) {
    const count = 9 + Math.floor(random() * 6)
    for (let k = 0; k < count; k++) {
      const date = addDays(start, Math.floor(random() * 14))
      let pick = random() * SPEND_WEIGHT
      const group = SPENDS.find((s) => (pick -= s.weight) < 0) ?? SPENDS[0]!
      const [note, min, max] = group.kinds[Math.floor(random() * group.kinds.length)]!
      // To the nearest 5 cents, so amounts look like prices rather than noise.
      const amount = Math.round((min + random() * (max - min)) * 20) / 20
      if (date >= handFrom) continue
      transactions.push({
        id: `demo-tx-past-${++n}`,
        date,
        amount: -money(amount),
        note,
        createdAt: at(date, 8 + (k % 4) * 3),
        ...(group.category ? { envelopeId: env(group.category) } : {}),
      })
    }
  }

  // A few days with no spending, marked; the spending list below leaves them empty.
  const noSpendOffsets = [-9, -6, -3]
  const noSpend: NoSpendDay[] = noSpendOffsets.map((o) => ({ date: day(o) }))

  const [groceries, eatingOut, transport, care, fun] = [
    env('Groceries'),
    env('Eating out'),
    env('Transport'),
    env('Personal care'),
    env('Fun'),
  ]
  // The last two weeks by hand, so Today and this period read like a real fortnight.
  const spending: [offset: number, note: string, amount: number, envelope?: string][] = [
    [-13, 'Groceries', 46.8, groceries],
    [-13, 'Coffee', 3.2, eatingOut],
    [-12, 'Lunch', 9.5, eatingOut],
    [-12, 'Bus', 2.4, transport],
    [-11, 'Pharmacy', 12.35, care],
    [-11, 'Coffee', 3.2, eatingOut],
    [-10, 'Takeaway', 18.9, eatingOut],
    [-10, 'Snacks', 4.1],
    [-8, 'Groceries', 38.15, groceries],
    [-8, 'Bus', 2.8, transport],
    [-7, 'Coffee', 3.2, eatingOut],
    [-7, 'Books', 14.99, fun],
    [-5, 'Groceries', 52.4, groceries],
    [-5, 'Dinner out', 27, eatingOut],
    [-4, 'Coffee', 3.2, eatingOut],
    [-4, 'Petrol', 45, transport],
    [-2, 'Lunch', 8.7, eatingOut],
    [-2, 'Haircut', 22, care],
    [-1, 'Groceries', 31.6, groceries],
    [-1, 'Coffee', 3.4, eatingOut],
    [-1, 'Cinema', 11.5, fun],
    [0, 'Coffee', 3.2, eatingOut],
    [0, 'Lunch', 9.8, eatingOut],
  ]
  let todayCount = 0
  for (const [i, [offset, note, amount, envelopeId]] of spending.entries()) {
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
      ...(envelopeId ? { envelopeId } : {}),
    })
  }

  // A check-in every payday evening and one last night. Each balance is the opening one
  // plus everything above up to that day, so Look back's carry-over adds up exactly.
  const checkInDays = new Set([...paydays, day(-1)])
  const moved = new Map<ISODate, number>()
  const move = (date: ISODate, amount: number) => moved.set(date, (moved.get(date) ?? 0) + amount)
  for (const t of transactions) if (t.date < today) move(t.date, t.amount)
  for (const o of billOccurrences) move(o.originalDate, -(o.paidAmount ?? 0))
  for (const p of paydays) move(p, pay)
  const checkIns: BalanceCheckIn[] = []
  let balance = money(200)
  for (let date = historyStart; date < today; date = addDays(date, 1)) {
    balance += moved.get(date) ?? 0
    if (checkInDays.has(date))
      checkIns.push({
        id: `demo-checkin-${checkIns.length + 1}`,
        at: at(date, date === day(-1) ? 21 : 18),
        date,
        balance,
      })
  }

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

  // One note for this payday and one for a day ahead, so Plan and the calendar show both.
  const notes: Note[] = [
    {
      id: noteId({ periodStart: lastPayday }),
      periodStart: lastPayday,
      text: 'Mum’s birthday this period. Her present comes from Gifts.',
      updatedAt: at(lastPayday, 19),
    },
    {
      id: noteId({ date: day(4) }),
      date: day(4),
      text: 'Car service at 9. Keep the morning free.',
      updatedAt: at(day(-1), 21),
    },
  ]

  // Three life goals in three states, two leaning on a fund or a debt, so Goals shows
  // the why behind the numbers.
  const lifeGoals: LifeGoal[] = [
    {
      id: 'demo-goal-trip',
      title: 'Two weeks by the sea',
      why: 'No laptop, long swims, and a proper rest for once.',
      targetDate: addMonths(today, 5),
      status: 'doing',
      fundId: 'demo-fund-holiday',
      createdAt: at(historyStart, 20),
    },
    {
      id: 'demo-goal-card',
      title: 'Credit card at zero',
      why: 'One less thing to think about every month.',
      status: 'doing',
      debtId: 'demo-debt-card',
      createdAt: at(historyStart, 20),
    },
    {
      id: 'demo-goal-cushion',
      title: 'A month of rent put by',
      status: 'todo',
      createdAt: at(day(-30), 21),
    },
  ]

  return {
    lifeGoals,
    incomes,
    bills,
    billOccurrences,
    transactions,
    checkIns,
    funds,
    debts,
    impulse,
    noSpend,
    envelopes,
    notes,
    // What the garden counts for all this history; it only grows from here.
    gardenPoints: gardenPoints({
      checkIns,
      occurrences: billOccurrences,
      noSpend,
      impulse,
      transactions,
    }),
  }
}

/**
 * Replaces whatever is in the demo database with the sample household, finished setup
 * included, in one transaction. Settings keep what was chosen before, or on a first visit
 * (no settings yet) the device's locale, currency and week start, as setup would pick:
 * a visitor in the US should see "$" and a Sunday week, not the app's EUR default.
 * Full mode and envelopes are on so every tab has something to show.
 */
export async function seedDemo(now: Date = new Date()): Promise<void> {
  const stored = (await db.meta.get('settings'))?.value as Partial<Settings> | undefined
  const previous = withDefaults(stored ?? detectLocaleDefaults())
  await resetDemo()
  const today = todayISO(now)
  const data = buildDemoData(today, now, previous.decimals)
  const stamp = now.toISOString()
  const demo: DemoState = { startedAt: stamp, kind: 'sample', entries: 0 }
  const meta: RowTypes['meta'][] = [
    {
      key: 'settings',
      value: { ...previous, simpleMode: false, envelopesEnabled: true } satisfies Settings,
    },
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
