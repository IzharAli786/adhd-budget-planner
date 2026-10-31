import type { Id, Instant } from '../../domain/types'

export const newId = (): Id => crypto.randomUUID()
export const nowInstant = (): Instant => new Date().toISOString()

/** Soft-deleted rows stay in the table (for Recently deleted and undo) but hide everywhere else. */
export const alive = <T extends { deletedAt?: Instant }>(rows: T[]): T[] =>
  rows.filter((r) => r.deletedAt === undefined)

export class NotFoundError extends Error {
  constructor(table: string, key: string) {
    super(`${table}: no row ${key}`)
    this.name = 'NotFoundError'
  }
}

/** Shallow patch that never lets a caller change the primary key. */
export function patchRow<T extends { id: Id }>(row: T, patch: NoInfer<Partial<Omit<T, 'id'>>>): T {
  return { ...row, ...patch, id: row.id }
}
