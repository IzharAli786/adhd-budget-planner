import { Dexie } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { validateBackup } from '../backup'
import { MIGRATIONS, migrateData, type Migration } from '../migrations'
import {
  PRIMARY_KEY,
  SCHEMA_VERSION,
  SteadyDB,
  VERSIONS,
  type DataTableName,
  type SchemaVersion,
} from '../schema'
import { openDatabase, readSnapshot, snapshotDbName, writeSnapshot } from '../snapshot'
import { openFixture, V1_ROWS } from './fixtures/v1'

const names: string[] = []
const fresh = (label: string) => {
  const name = `fixture-${label}-${names.length}`
  names.push(name)
  return name
}

afterEach(async () => {
  for (const name of names.splice(0)) {
    await Dexie.delete(name)
    await Dexie.delete(snapshotDbName(name))
  }
})

// A pretend v2 that adds a compound index and renames transaction.note -> memo.
// It proves the harness end to end; real v2 work adds its own block to VERSIONS.
const V2: SchemaVersion = {
  version: 2,
  stores: { transactions: 'id, date, createdAt, envelopeId, fundId, debtId, [envelopeId+date]' },
}
const renameNote: Migration = (data) => ({
  ...data,
  transactions: (data.transactions ?? []).map((t) => {
    const { note, ...rest } = t as { note: string }
    return { ...rest, memo: note }
  }),
})

describe('migrateData', () => {
  it('runs registered steps in order and passes index-only versions through', () => {
    const calls: number[] = []
    const step =
      (v: number): Migration =>
      (d) => {
        calls.push(v)
        return { ...d, log: [...(d.log ?? []), v] }
      }
    const out = migrateData({ log: [] }, 1, 4, { 2: step(2), 4: step(4) })
    expect(out.log).toEqual([2, 4])
    expect(calls).toEqual([2, 4])
    expect(migrateData({ a: [1] }, 3, 3, { 3: step(3) })).toEqual({ a: [1] })
  })

  it('v1 has no transforms', () => {
    expect(SCHEMA_VERSION).toBe(1)
    expect(Object.keys(MIGRATIONS)).toEqual([])
  })
})

describe('real-fixture upgrades', () => {
  it('a v1 database opens with the current schema and keeps every row', async () => {
    const name = fresh('v1')
    await openFixture(name, 1)
    const db = new SteadyDB(name)
    await openDatabase(db, new Date('2026-10-31T00:00:00Z'))
    for (const [table, rows] of Object.entries(V1_ROWS)) {
      // IndexedDB returns rows in primary-key order.
      const key = PRIMARY_KEY[table as DataTableName]
      const sorted = [...rows].sort((a, b) =>
        String((a as Record<string, unknown>)[key]) < String((b as Record<string, unknown>)[key])
          ? -1
          : 1,
      )
      expect(await db.table(table).toArray()).toEqual(sorted)
    }
    expect(await readSnapshot(name, 'migration')).toBeUndefined() // same version: no snapshot
    db.close()
  })

  it('v1 -> v2 runs the transform inside upgrade() after snapshotting v1', async () => {
    const name = fresh('v2')
    await openFixture(name, 1)
    const now = new Date('2026-10-31T00:00:00Z')
    const db = new SteadyDB(name, [...VERSIONS, V2], { 2: renameNote })
    await openDatabase(db, now)

    expect(db.verno).toBe(2)
    const tx = await db.transactions.get('tx-1')
    expect(tx).toMatchObject({ memo: 'coffee' })
    expect(tx).not.toHaveProperty('note')
    expect(
      await db.transactions.where('[envelopeId+date]').equals(['env-every', '2026-10-28']).count(),
    ).toBe(1)
    expect(await db.bills.count()).toBe(V1_ROWS.bills.length) // untouched tables survive

    const snap = await readSnapshot(name, 'migration')
    expect(snap).toMatchObject({ fromVersion: 1, sourceDb: name, at: now.toISOString() })
    expect((snap!.data.transactions as { note: string }[]).map((t) => t.note).sort()).toEqual([
      'coffee',
      'extra card payment',
      'holiday fund',
    ])
    db.close()
  })

  it('a transform clears the undo log, whose before-images are in the old shape', async () => {
    const name = fresh('undo')
    await openFixture(name, 1)
    const raw = new SteadyDB(name)
    await raw.open()
    await raw.undo.add({
      at: '2026-10-30T00:00:00.000Z',
      label: 'Edit entry',
      ops: [{ table: 'transactions', key: 'tx-1', before: { ...V1_ROWS.transactions[0] } }],
    })
    raw.close()

    const db = new SteadyDB(name, [...VERSIONS, V2], { 2: renameNote })
    await openDatabase(db, new Date('2026-10-31T00:00:00Z'))
    expect(await db.undo.count()).toBe(0)
    db.close()
  })

  it('never opens (and so never upgrades) on a first query: openDatabase must run first', async () => {
    const name = fresh('autoopen')
    await openFixture(name, 1)
    const db = new SteadyDB(name, [...VERSIONS, V2], { 2: renameNote })
    await expect(db.transactions.count()).rejects.toThrow()
    expect(await readSnapshot(name, 'migration')).toBeUndefined()
    await openDatabase(db, new Date('2026-10-31T00:00:00Z'))
    expect(await readSnapshot(name, 'migration')).toBeDefined()
    db.close()
  })

  it('import of an old-version file reuses the same transform', () => {
    const file = {
      app: 'steady',
      schemaVersion: 1,
      exportedAt: '2026-10-31T00:00:00.000Z',
      source: 'full',
      currency: 'EUR',
      decimals: 2,
      data: {
        transactions: [
          {
            id: 't',
            date: '2026-10-31',
            amount: -1,
            note: 'x',
            createdAt: '2026-10-31T00:00:00.000Z',
          },
        ],
      },
    }
    const upgraded = migrateData(file.data, 1, 2, { 2: renameNote })
    expect(upgraded.transactions).toEqual([
      { id: 't', date: '2026-10-31', amount: -1, memo: 'x', createdAt: '2026-10-31T00:00:00.000Z' },
    ])
    // Today's validator reads v1 files directly.
    expect(validateBackup(file).ok).toBe(true)
  })
})

describe('snapshots', () => {
  it('are pruned 7 days after they were taken, on the next successful open', async () => {
    const name = fresh('prune')
    await openFixture(name, 1)
    const db = new SteadyDB(name)
    await db.open()
    await writeSnapshot(db, 'import', new Date('2026-10-01T00:00:00Z'))

    await openDatabase(db, new Date('2026-10-07T00:00:00Z'))
    expect(await readSnapshot(name, 'import')).toBeDefined()
    await openDatabase(db, new Date('2026-10-08T00:00:01Z'))
    expect(await readSnapshot(name, 'import')).toBeUndefined()
    db.close()
  })

  it('a fresh install opens without creating a snapshot', async () => {
    const name = fresh('new')
    const db = new SteadyDB(name)
    await openDatabase(db)
    expect(await readSnapshot(name, 'migration')).toBeUndefined()
    db.close()
  })
})
