// Dexie schema (PLAN §3.4). Never edit an old version block: add version n+1 to VERSIONS
// and, if rows need reshaping, a pure transform in migrations.ts under the same number.
import { Dexie, type EntityTable, type Transaction as DexieTransaction } from 'dexie'
import type {
  BalanceCheckIn,
  Bill,
  BillOccurrence,
  Debt,
  Envelope,
  ImpulseItem,
  IncomeSource,
  Meta,
  NoSpendDay,
  PaydayOverride,
  SavingsFund,
  Transaction,
  UndoEntry,
} from '../domain/types'
import { MIGRATIONS, type Migration, type TableData } from './migrations'

export interface SchemaVersion {
  version: number
  stores: Record<string, string | null>
}

// Index only what we query by. deletedAt is deliberately NOT indexed: IndexedDB skips rows
// whose key is undefined, so "not deleted" can't be queried anyway; we filter in JS.
export const VERSIONS: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: {
      incomes: 'id',
      paydayOverrides: 'id, incomeId',
      bills: 'id, debtId',
      billOccurrences: 'id, billId, originalDate',
      envelopes: 'id, sort',
      transactions: 'id, date, createdAt, envelopeId, fundId, debtId',
      checkIns: 'id, at',
      funds: 'id',
      debts: 'id',
      impulse: 'id, addedAt',
      noSpend: 'date',
      undo: '++seq',
      meta: 'key',
    },
  },
]

export const SCHEMA_VERSION = VERSIONS[VERSIONS.length - 1]!.version

/** User data tables, in a stable order. `undo` is bookkeeping and never exported. */
export const DATA_TABLES = [
  'incomes',
  'paydayOverrides',
  'bills',
  'billOccurrences',
  'envelopes',
  'transactions',
  'checkIns',
  'funds',
  'debts',
  'impulse',
  'noSpend',
  'meta',
] as const
export type DataTableName = (typeof DATA_TABLES)[number]
export type TableName = DataTableName | 'undo'

export interface RowTypes {
  incomes: IncomeSource
  paydayOverrides: PaydayOverride
  bills: Bill
  billOccurrences: BillOccurrence
  envelopes: Envelope
  transactions: Transaction
  checkIns: BalanceCheckIn
  funds: SavingsFund
  debts: Debt
  impulse: ImpulseItem
  noSpend: NoSpendDay
  meta: Meta
}

/** Primary key field per table, used by the undo log and backup duplicate checks. */
export const PRIMARY_KEY: Record<DataTableName, string> = {
  incomes: 'id',
  paydayOverrides: 'id',
  bills: 'id',
  billOccurrences: 'id',
  envelopes: 'id',
  transactions: 'id',
  checkIns: 'id',
  funds: 'id',
  debts: 'id',
  impulse: 'id',
  noSpend: 'date',
  meta: 'key',
}

// The demo build lives on its own origin, but a distinct name also keeps a local
// `vite --mode demo` from touching real data on localhost.
export const DB_NAME = import.meta.env.MODE === 'demo' ? 'steady-demo' : 'steady'

export class SteadyDB extends Dexie {
  incomes!: EntityTable<IncomeSource, 'id'>
  paydayOverrides!: EntityTable<PaydayOverride, 'id'>
  bills!: EntityTable<Bill, 'id'>
  billOccurrences!: EntityTable<BillOccurrence, 'id'>
  envelopes!: EntityTable<Envelope, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  checkIns!: EntityTable<BalanceCheckIn, 'id'>
  funds!: EntityTable<SavingsFund, 'id'>
  debts!: EntityTable<Debt, 'id'>
  impulse!: EntityTable<ImpulseItem, 'id'>
  noSpend!: EntityTable<NoSpendDay, 'date'>
  undo!: EntityTable<UndoEntry, 'seq'>
  meta!: EntityTable<Meta, 'key'>

  // versions/migrations are parameters so tests can open a database "from the future"
  // and exercise the real upgrade path against fixture rows.
  constructor(
    name: string = DB_NAME,
    versions: readonly SchemaVersion[] = VERSIONS,
    migrations: Partial<Record<number, Migration>> = MIGRATIONS,
  ) {
    // No auto-open: the first query must not silently run an upgrade. openDatabase()
    // (snapshot.ts) has to look at the on-disk version and take a snapshot first.
    super(name, { autoOpen: false })
    for (const { version, stores } of versions) {
      const v = this.version(version).stores(stores)
      const migrate = migrations[version]
      if (migrate) v.upgrade((tx) => runMigrationInTx(tx, migrate))
    }
    // Another tab opened a newer version: step aside so its upgrade isn't blocked.
    // The app shell reloads on 'versionchange' when idle (M3).
    this.on('versionchange', () => {
      this.close()
      return false
    })
  }
}

// Same pure transform the importer uses, applied to the live tables. Tables are small
// (thousands of rows at most), so read-all / write-all is fine and keeps transforms pure.
async function runMigrationInTx(tx: DexieTransaction, migrate: Migration) {
  const data: TableData = {}
  for (const table of tx.storeNames) {
    if (table === 'undo') continue
    data[table] = await tx.table(table).toArray()
  }
  const next = migrate(data)
  for (const [table, rows] of Object.entries(next)) {
    await tx.table(table).clear()
    await tx.table(table).bulkPut(rows)
  }
  // Undo before-images are rows in the OLD shape; replaying one after the transform
  // would write a pre-migration row back into the new schema.
  await tx.table('undo').clear()
}

export const db = new SteadyDB()
