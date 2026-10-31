import { Dexie } from 'dexie'
import { db } from '../schema'
import { snapshotDbName } from '../snapshot'
import type { TableData } from '../migrations'

/** Empties the app DB and its snapshot DB so every test starts from a fresh install. */
export async function resetDb() {
  if (!db.isOpen()) await db.open()
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
  await Dexie.delete(snapshotDbName(db.name))
}

export async function loadRows(rows: TableData) {
  await db.transaction('rw', db.tables, async () => {
    for (const [table, data] of Object.entries(rows)) await db.table(table).bulkPut(data)
  })
}

/** An install past the unlock screen and first-run setup, for tests of the app itself. */
export async function seedReadyInstall() {
  await db.meta.bulkPut([
    { key: 'unlocked', value: { at: '2026-01-01T09:00:00.000Z', hashPrefix: 'test' } },
    { key: 'setupProgress', value: { step: 'done', doneAt: '2026-01-01T09:00:00.000Z' } },
  ])
}

/** structuredClone keeps the fixture constant immune to the code under test. */
export const clone = <T>(value: T): T => structuredClone(value)
