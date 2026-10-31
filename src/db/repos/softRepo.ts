// Shared CRUD for the tables that soft-delete (bills, envelopes, transactions, funds, debts).
// Delete only stamps deletedAt, so "Recently deleted" and undo both have the row to return to.
import type { Id, Instant } from '../../domain/types'
import { db, type DataTableName, type RowTypes } from '../schema'
import { mutate, type Writer } from '../undo'
import { alive, NotFoundError, newId, nowInstant, patchRow } from './util'

type SoftRow = { id: Id; deletedAt?: Instant }
type AnyRow = RowTypes[DataTableName]

export function softRepo<R extends SoftRow>(table: DataTableName, noun: string) {
  const store = () => db.table<R, Id>(table)
  const put = (w: Writer, row: R) => w.put(table, row as unknown as AnyRow)

  async function load(w: Writer, id: Id): Promise<R> {
    const row = (await w.get(table, id)) as R | undefined
    if (!row) throw new NotFoundError(table, id)
    return row
  }

  return {
    get: (id: Id) => store().get(id),
    /** Live (not deleted) rows. */
    list: async () => alive(await store().toArray()),
    listDeleted: async () => (await store().toArray()).filter((r) => r.deletedAt !== undefined),

    add: (row: Omit<R, 'id'>, label = `Add ${noun}`) =>
      mutate(label, [table], async (w) => {
        const created = { ...row, id: newId() } as R
        await put(w, created)
        return created
      }),

    update: (id: Id, patch: Partial<Omit<R, 'id'>>, label = `Edit ${noun}`) =>
      mutate(label, [table], async (w) => {
        const next = patchRow(await load(w, id), patch)
        await put(w, next)
        return next
      }),

    remove: (id: Id, label = `Delete ${noun}`) =>
      mutate(label, [table], async (w) => {
        await put(w, { ...(await load(w, id)), deletedAt: nowInstant() })
      }),

    restore: (id: Id, label = `Restore ${noun}`) =>
      mutate(label, [table], async (w) => {
        const row = { ...(await load(w, id)) }
        delete row.deletedAt
        await put(w, row)
      }),

    // Exposed for repos that need to touch several tables in one undo step.
    load,
    put,
  }
}
