// Safety net for upgrades and restores (PLAN §3.4, §6). Before a schema upgrade or an
// import replaces data, every table is dumped into a SEPARATE database. A failed migration
// can then never take the only copy with it. Never stored in meta and never exported.
import { Dexie, type EntityTable } from 'dexie'
import type { Instant } from '../domain/types'
import type { TableData } from './migrations'
import type { SteadyDB } from './schema'

export type SnapshotReason = 'migration' | 'import'

export interface Snapshot {
  // One row per event, not per reason. With a single "import" slot, restoring a wrong
  // file twice would overwrite the only copy of the real data with the first wrong file.
  id: string // `${reason}|${at}`
  reason: SnapshotReason
  at: Instant
  sourceDb: string
  fromVersion: number
  data: TableData
}

const KEEP_MS = 7 * 86_400_000

class SnapshotDB extends Dexie {
  snapshots!: EntityTable<Snapshot, 'id'>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ snapshots: 'id' })
  }
}

export const snapshotDbName = (sourceDb: string) => `${sourceDb}-premigration`

async function withSnapshotDb<T>(sourceDb: string, fn: (s: SnapshotDB) => Promise<T>) {
  const s = new SnapshotDB(snapshotDbName(sourceDb))
  try {
    return await fn(s)
  } finally {
    s.close()
  }
}

/** Reads every table of an open database except the undo log. */
export async function dumpTables(source: Dexie): Promise<TableData> {
  const data: TableData = {}
  for (const table of source.tables) {
    if (table.name === 'undo') continue
    data[table.name] = await table.toArray()
  }
  return data
}

export async function writeSnapshot(
  source: Dexie,
  reason: SnapshotReason,
  now: Date = new Date(),
): Promise<void> {
  const data = await dumpTables(source)
  await withSnapshotDb(source.name, (s) =>
    s.snapshots.put({
      id: `${reason}|${now.toISOString()}`,
      reason,
      at: now.toISOString(),
      sourceDb: source.name,
      fromVersion: source.verno,
      data,
    }),
  )
}

/** All snapshots of `sourceDb`, oldest first. */
export function listSnapshots(sourceDb: string) {
  return withSnapshotDb(sourceDb, async (s) =>
    (await s.snapshots.toArray()).sort((a, b) => (a.at < b.at ? -1 : 1)),
  )
}

/** The most recent snapshot taken for `reason`. */
export async function readSnapshot(sourceDb: string, reason: SnapshotReason) {
  return (await listSnapshots(sourceDb)).filter((x) => x.reason === reason).pop()
}

/** Drops snapshots older than 7 days. Only called after a successful versioned open. */
export function pruneSnapshots(sourceDb: string, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - KEEP_MS).toISOString()
  return withSnapshotDb(sourceDb, (s) => s.snapshots.filter((x) => x.at < cutoff).delete())
}

/**
 * Opens the app database, snapshotting first if the stored version is older than the code.
 * The probe opens without a version ("dynamic mode"), which reads whatever schema is on
 * disk without triggering an upgrade.
 */
export async function openDatabase(target: SteadyDB, now: Date = new Date()): Promise<void> {
  if (await Dexie.exists(target.name)) {
    const probe = new Dexie(target.name)
    try {
      await probe.open()
      if (probe.verno < target.verno) await writeSnapshot(probe, 'migration', now)
    } finally {
      probe.close()
    }
  }
  await target.open()
  await pruneSnapshots(target.name, now)
}
