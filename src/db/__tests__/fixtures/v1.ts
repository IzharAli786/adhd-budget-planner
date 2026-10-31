// A realistic version-1 database: every table populated, every reference resolving.
// Built as real rows in fake-indexeddb by openFixture(), never by mocking Dexie.
import { Dexie } from 'dexie'
import { VERSIONS } from '../../schema'
import type { TableData } from '../../migrations'

export const V1_ROWS = {
  incomes: [
    {
      id: 'inc-1',
      name: 'Salary',
      amount: 210000,
      schedule: { kind: 'monthly', day: 'last' },
      weekendRule: 'before',
      primary: true,
      active: true,
    },
    {
      id: 'inc-2',
      name: 'Side gig',
      amount: 15000,
      schedule: { kind: 'semimonthly', days: [1, 15] },
      weekendRule: 'none',
      primary: false,
      active: true,
    },
  ],
  paydayOverrides: [
    { id: 'inc-1|2026-12-31', incomeId: 'inc-1', originalDate: '2026-12-31', date: '2026-12-23' },
  ],
  bills: [
    {
      id: 'bill-rent',
      name: 'Rent',
      amount: 95000,
      rule: { freq: 'monthly', interval: 1, day: 1, anchor: '2026-01-01' },
      autopay: true,
      envelopeId: 'env-home',
      createdAt: '2026-01-01T09:00:00.000Z',
    },
    {
      id: 'bill-card',
      name: 'Card minimum',
      amount: 4000,
      rule: { freq: 'monthly', interval: 1, day: 20, anchor: '2026-01-05' },
      autopay: false,
      debtId: 'debt-card',
      createdAt: '2026-01-05T09:00:00.000Z',
    },
    {
      id: 'bill-old',
      name: 'Old gym',
      amount: 3500,
      rule: { freq: 'weekly', interval: 4, anchor: '2026-02-02' },
      autopay: false,
      createdAt: '2026-02-02T09:00:00.000Z',
      deletedAt: '2026-10-20T09:00:00.000Z',
    },
  ],
  billOccurrences: [
    {
      id: 'bill-rent|2026-10-01',
      billId: 'bill-rent',
      originalDate: '2026-10-01',
      status: 'paid',
      paidAmount: 95000,
      paidAt: '2026-10-01T08:00:00.000Z',
      auto: true,
    },
  ],
  envelopes: [
    { id: 'env-every', name: 'Everyday', budget: 40000, isDefault: true, color: 'accent', sort: 0 },
    { id: 'env-home', name: 'Home', budget: 0, isDefault: false, color: 'sage', sort: 1 },
  ],
  transactions: [
    {
      id: 'tx-1',
      date: '2026-10-28',
      amount: -1200,
      note: 'coffee',
      envelopeId: 'env-every',
      createdAt: '2026-10-28T08:15:00.000Z',
    },
    {
      id: 'tx-2',
      date: '2026-10-29',
      amount: -2500,
      note: 'holiday fund',
      fundId: 'fund-trip',
      createdAt: '2026-10-29T08:15:00.000Z',
    },
    {
      id: 'tx-3',
      date: '2026-10-30',
      amount: -10000,
      note: 'extra card payment',
      debtId: 'debt-card',
      inBalance: true,
      createdAt: '2026-10-30T08:15:00.000Z',
    },
  ],
  checkIns: [{ id: 'ci-1', at: '2026-10-27T19:00:00.000Z', date: '2026-10-27', balance: 123456 }],
  funds: [
    {
      id: 'fund-trip',
      name: 'Trip',
      target: 100000,
      perPeriod: 5000,
      openingSaved: 20000,
      challenge: { kind: '52week', start: '2026-01-05' },
    },
  ],
  debts: [
    {
      id: 'debt-card',
      name: 'Card',
      balance: 250000,
      balanceAsOf: '2026-01-05',
      aprBps: 2299,
      minPayment: 4000,
      dueDay: 20,
    },
  ],
  impulse: [{ id: 'imp-1', name: 'Headphones', amount: 8999, addedAt: '2026-10-29T20:00:00.000Z' }],
  noSpend: [{ date: '2026-10-26' }],
  meta: [
    { key: 'settings', value: { currency: 'EUR', decimals: 2, theme: 'sage', buffer: 5000 } },
    { key: 'lastBackupAt', value: '2026-10-01T10:00:00.000Z' },
    { key: 'unlocked', value: { at: '2026-01-01T09:00:00.000Z', hashPrefix: 'abcd' } },
    { key: 'changesSinceBackup', value: 7 },
  ],
} satisfies TableData

/** Creates database `name` at schema `version` (as that version shipped) and fills it. */
export async function openFixture(name: string, version: number, rows: TableData = V1_ROWS) {
  const raw = new Dexie(name)
  for (const v of VERSIONS.filter((x) => x.version <= version))
    raw.version(v.version).stores(v.stores)
  await raw.open()
  await raw.transaction('rw', raw.tables, async () => {
    for (const [table, data] of Object.entries(rows)) await raw.table(table).bulkPut(data)
  })
  raw.close()
}
