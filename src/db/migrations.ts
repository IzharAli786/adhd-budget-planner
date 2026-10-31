// Pure data transforms between schema versions. MIGRATIONS[n] turns version n-1 rows into
// version n rows. The same function runs inside Dexie's upgrade() and on imported backups,
// so an old backup file and an old on-device database take exactly the same path.
// No Dexie, no clock: input rows in, output rows out.

/** Rows per table name. Loose on purpose: old versions have shapes the current types don't. */
export type TableData = Record<string, unknown[]>
export type Migration = (data: TableData) => TableData

type DebtRow = { balance?: unknown; originalBalance?: unknown }

export const MIGRATIONS: Partial<Record<number, Migration>> = {
  // v2: "% paid" needs the balance a debt started from. Older rows never stored it, so the
  // best honest guess is the balance as last entered: they start at 0% paid, not a made-up number.
  2: (d) =>
    d.debts === undefined
      ? d
      : {
          ...d,
          debts: d.debts.map((row) => {
            const debt = row as DebtRow
            return debt.originalBalance === undefined
              ? { ...debt, originalBalance: debt.balance }
              : debt
          }),
        },
}

/**
 * Applies every transform from `from` (exclusive) to `to` (inclusive). A version without
 * an entry only changed indexes, so its data passes through unchanged.
 */
export function migrateData(
  data: TableData,
  from: number,
  to: number,
  registry: Partial<Record<number, Migration>> = MIGRATIONS,
): TableData {
  let current = data
  for (let v = from + 1; v <= to; v++) {
    const step = registry[v]
    if (step) current = step(current)
  }
  return current
}
