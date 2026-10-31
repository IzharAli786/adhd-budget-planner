// Persisted undo log (PLAN §8), a small command pattern: every repo write goes through
// mutate(), which records each touched row's before-image in the same transaction as the
// write. Undo replays the before-images. Because the log lives in IndexedDB it survives a
// reload and can never disagree with what useLiveQuery shows.
import type { UndoEntry } from '../domain/types'
import { db, PRIMARY_KEY, type DataTableName, type RowTypes, type TableName } from './schema'

export const UNDO_LIMIT = 20

/**
 * Hooks for user actions that created rows. The demo build installs one for its entry cap
 * (db/demo.ts); the full app has none, so this costs it nothing.
 */
export interface CreateGuard {
  /** Inside the action's transaction, with the tables new rows went into. Throwing aborts it. */
  created(tables: DataTableName[], label: string): Promise<void>
  /** Inside undo's transaction, when the undone action had created rows: a refund. */
  undone(tables: DataTableName[], label: string): Promise<void>
}
let createGuard: CreateGuard | null = null
export function setCreateGuard(guard: CreateGuard | null) {
  createGuard = guard
}

export interface Writer {
  get<T extends DataTableName>(table: T, key: string): Promise<RowTypes[T] | undefined>
  put<T extends DataTableName>(table: T, row: RowTypes[T]): Promise<void>
  delete(table: DataTableName, key: string): Promise<void>
}

/**
 * Runs `fn` in one read-write transaction over `tables` (plus the undo log). With a label,
 * the change becomes one undo step; with null it is not undoable (settings, purges).
 */
export async function mutate<R>(
  label: string | null,
  tables: readonly DataTableName[],
  fn: (w: Writer) => Promise<R>,
): Promise<R> {
  // meta always joins: an undoable change bumps the "changes since backup" counter.
  const stores = [...new Set<TableName>([...tables, 'meta', 'undo'])].map((t) => db.table(t))
  return db.transaction('rw', stores, async () => {
    const ops: UndoEntry['ops'] = []
    const seen = new Set<string>()
    const created = new Set<DataTableName>()

    // Only the FIRST before-image per row counts: if one action writes a row twice,
    // undo must return to the state before the action, not the middle step.
    async function remember(table: DataTableName, key: string, isPut = false) {
      const id = `${table}\u0000${key}`
      if (label === null || seen.has(id)) return
      seen.add(id)
      const before = (await db.table(table).get(key)) ?? null
      if (before === null && isPut) created.add(table)
      ops.push({ table, key, before })
    }

    const writer: Writer = {
      get: (table, key) => db.table(table).get(key),
      async put(table, row) {
        await remember(
          table,
          String((row as unknown as Record<string, unknown>)[PRIMARY_KEY[table]]),
          true,
        )
        await db.table(table).put(row)
      },
      async delete(table, key) {
        await remember(table, key)
        await db.table(table).delete(key)
      },
    }

    const result = await fn(writer)
    if (createGuard && label !== null && created.size > 0)
      await createGuard.created([...created], label)
    if (label !== null && ops.length > 0) {
      await db.undo.add({ at: new Date().toISOString(), label, ops })
      await trimUndo()
      await countChange()
    }
    return result
  })
}

// Only user actions count (label !== null): settings and bookkeeping are not "your data
// changed since the last backup". Written directly, never through the undo log.
async function countChange() {
  const row = await db.meta.get(CHANGES_KEY)
  await db.meta.put({ key: CHANGES_KEY, value: ((row?.value as number | undefined) ?? 0) + 1 })
}

export const CHANGES_KEY = 'changesSinceBackup'

async function trimUndo() {
  const count = await db.undo.count()
  if (count <= UNDO_LIMIT) return
  const old = await db.undo
    .orderBy('seq')
    .limit(count - UNDO_LIMIT)
    .primaryKeys()
  await db.undo.bulkDelete(old)
}

export async function lastUndo(): Promise<UndoEntry | undefined> {
  return db.undo.orderBy('seq').last()
}

/** Reverts the most recent undoable change. Returns its label, or null if the log is empty. */
export async function undoLast(): Promise<string | null> {
  return db.transaction('rw', db.tables, async () => {
    const entry = await db.undo.orderBy('seq').last()
    if (!entry) return null
    const created = new Set<DataTableName>()
    for (const op of entry.ops) {
      const table = db.table(op.table)
      if (op.before === null) {
        await table.delete(op.key)
        created.add(op.table as DataTableName) // mutate() only logs data tables
      } else await table.put(op.before)
    }
    if (createGuard && created.size > 0) await createGuard.undone([...created], entry.label)
    await db.undo.delete(entry.seq!)
    await countChange()
    return entry.label
  })
}

export function clearUndo() {
  return db.undo.clear()
}
