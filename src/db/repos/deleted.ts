// "Recently deleted" (PLAN §8): soft-deleted rows stay restorable for 30 days.
import type { Instant } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { restoreBill } from './bills'
import { restoreDebt } from './debts'
import { restoreEnvelope } from './envelopes'
import { restoreFund } from './funds'
import { restoreTransaction } from './transactions'

export const SOFT_DELETE_TABLES = ['bills', 'envelopes', 'transactions', 'funds', 'debts'] as const
export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number]

export const RETENTION_DAYS = 30

export interface DeletedItem {
  table: SoftDeleteTable
  id: string
  name: string
  deletedAt: Instant
}

/** The day a deleted row goes for good (shown as "N days left"). */
export const purgeAt = (deletedAt: Instant) =>
  new Date(Date.parse(deletedAt) + RETENTION_DAYS * 86_400_000).toISOString()

const labelOf = (row: { name?: string; note?: string }) => row.name ?? row.note ?? ''

/** Every soft-deleted row, newest first. */
export async function listRecentlyDeleted(): Promise<DeletedItem[]> {
  const items: DeletedItem[] = []
  // A debt's minimum bill is deleted with it (same stamp) and comes back with it, so it
  // is not a separate thing to restore.
  const debtStamps = new Map(
    (await db.debts.toArray()).filter((d) => d.deletedAt).map((d) => [d.id, d.deletedAt]),
  )
  for (const table of SOFT_DELETE_TABLES) {
    const rows = (await db.table(table).toArray()) as {
      id: string
      name?: string
      note?: string
      debtId?: string
      deletedAt?: Instant
    }[]
    for (const row of rows) {
      if (!row.deletedAt) continue
      if (table === 'bills' && row.debtId && debtStamps.get(row.debtId) === row.deletedAt) continue
      items.push({ table, id: row.id, name: labelOf(row), deletedAt: row.deletedAt })
    }
  }
  return items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
}

const RESTORE: Record<SoftDeleteTable, (id: string) => Promise<unknown>> = {
  bills: restoreBill,
  envelopes: restoreEnvelope,
  transactions: restoreTransaction,
  funds: restoreFund,
  debts: restoreDebt,
}

/** One undo step, through the table's own repo (a debt brings its minimum bill back too). */
export const restoreDeleted = (item: Pick<DeletedItem, 'table' | 'id'>) =>
  RESTORE[item.table](item.id)

// Rows that may point at a purgeable row. Purging must unlink them: a dangling
// envelopeId/fundId/debtId would make the app's OWN next backup fail restore validation.
const REFERENCES: [table: 'transactions' | 'bills', field: string, target: SoftDeleteTable][] = [
  ['transactions', 'envelopeId', 'envelopes'],
  ['transactions', 'fundId', 'funds'],
  ['transactions', 'debtId', 'debts'],
  ['bills', 'envelopeId', 'envelopes'],
  ['bills', 'debtId', 'debts'],
]

/**
 * Hard-deletes rows soft-deleted more than `retentionDays` (30) days ago. Not undoable (that is the point).
 * Occurrence rows of a purged bill go too, so no override is left pointing at nothing,
 * and surviving rows that referenced a purged row are unlinked from it.
 */
export function purgeDeleted(now: Date = new Date(), retentionDays = RETENTION_DAYS) {
  // retentionDays 0 is "Empty now": everything deleted before this instant.
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString()
  return mutate(null, [...SOFT_DELETE_TABLES, 'billOccurrences'], async (w) => {
    const purged = new Map<SoftDeleteTable, Set<string>>()
    for (const table of SOFT_DELETE_TABLES) {
      const rows = (await db.table(table).toArray()) as { id: string; deletedAt?: Instant }[]
      const ids = new Set<string>()
      for (const row of rows) {
        if (!row.deletedAt || row.deletedAt > cutoff) continue
        await w.delete(table, row.id)
        ids.add(row.id)
        if (table === 'bills') {
          const occ = await db.billOccurrences.where('billId').equals(row.id).primaryKeys()
          for (const key of occ) await w.delete('billOccurrences', key)
        }
      }
      purged.set(table, ids)
    }

    for (const [table, field, target] of REFERENCES) {
      const gone = purged.get(target)!
      if (gone.size === 0) continue
      for (const row of (await db.table(table).toArray()) as Record<string, unknown>[]) {
        if (!gone.has(row[field] as string)) continue
        const copy = { ...row }
        delete copy[field]
        await w.put(table, copy as never)
      }
    }

    const count = [...purged.values()].reduce((n, ids) => n + ids.size, 0)
    // Older undo entries may hold before-images that still point at (or are) purged rows.
    // Replaying one would bring back exactly what purge just made consistent.
    if (count > 0) await db.undo.clear()
    return count
  })
}
