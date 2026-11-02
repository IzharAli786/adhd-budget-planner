// Demo state (PLAN §7). The demo keeps its data on its own origin, in the fixed
// 'steady-demo' database, so a buyer coming back from Etsy finds their setup again.
// It is capped (DEMO_CAP entries) and resets itself 7 days after it was started.
import type { Instant } from '../domain/types'
import { getMeta, setMeta } from './repos/meta'
import { db, type DataTableName } from './schema'
import { setCreateGuard, type CreateGuard } from './undo'

export const DEMO_CAP = 10
export const DEMO_DAYS = 7
const DAY_MS = 86_400_000

export interface DemoState {
  startedAt: Instant
  /** Which way in: the sample household, or the person's own numbers. */
  kind: 'sample' | 'own'
  /** Entries the person added (sample rows don't count). */
  entries: number
}

/**
 * What counts as "an entry": things a person adds. Paid ticks, no-spend marks and balance
 * check-ins don't: a check-in (or a catch-up after a gap) is how Today stays true, so a
 * demo at its cap must still allow it, or the main number goes stale with no way out.
 */
export const ENTRY_TABLES: readonly DataTableName[] = [
  'transactions',
  'bills',
  'incomes',
  'envelopes',
  'funds',
  'debts',
  'impulse',
]

// An edit can create a row too: "change from this date on" splits a bill into a new one,
// and so can a debt's due-day or balance change. Those are still edits, so never counted.
const isEdit = (label: string) => label.startsWith('Edit')
const countsAsEntry = (tables: DataTableName[], label: string) =>
  !isEdit(label) && tables.some((t) => ENTRY_TABLES.includes(t))

export class DemoLimitError extends Error {
  constructor() {
    super(`The demo holds ${DEMO_CAP} entries.`)
    this.name = 'DemoLimitError'
  }
}

// The limit sheet listens here. Emitted by the guard itself, so the sheet opens even
// when the screen that tried to save catches the error and shows nothing.
const listeners = new Set<() => void>()
export function onDemoLimit(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const getDemoState = () => getMeta<DemoState>('demo')

export function startDemo(kind: DemoState['kind'], now: Date = new Date()) {
  return setMeta('demo', { startedAt: now.toISOString(), kind, entries: 0 } satisfies DemoState)
}

export const demoExpired = (state: Pick<DemoState, 'startedAt'>, now: Date = new Date()) =>
  now.getTime() - new Date(state.startedAt).getTime() >= DEMO_DAYS * DAY_MS

export const entriesLeft = (state: DemoState | undefined) =>
  Math.max(0, DEMO_CAP - (state?.entries ?? 0))

/** Back to the two ways in. Every table, undo log included, in one transaction. */
export async function resetDemo() {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
}

/** Called on every open: a week-old demo starts over, so stale sample dates never show. */
export async function resetIfExpired(now: Date = new Date()): Promise<boolean> {
  const state = await getDemoState()
  if (!state || !demoExpired(state, now)) return false
  await resetDemo()
  return true
}

/**
 * The cap, as a write guard (db/undo.ts): it runs inside the action's transaction, so
 * the count and the new row commit together, and a refused action writes nothing.
 * One action is one entry, even when it writes two rows (a debt and its minimum bill).
 * Undoing an add gives the entry back, so trying things out and undoing them is free.
 */
export const demoCapGuard: CreateGuard = {
  async created(tables, label) {
    if (!countsAsEntry(tables, label)) return
    const state = await readState()
    if (!state) return
    if (state.entries >= DEMO_CAP) {
      for (const listener of listeners) listener()
      throw new DemoLimitError()
    }
    await writeState({ ...state, entries: state.entries + 1 })
  },
  async undone(tables, label) {
    if (!countsAsEntry(tables, label)) return
    const state = await readState()
    if (state && state.entries > 0) await writeState({ ...state, entries: state.entries - 1 })
  },
}

// Direct reads and writes: the guard is already inside a transaction that includes meta.
const readState = async () => (await db.meta.get('demo'))?.value as DemoState | undefined
const writeState = (state: DemoState) => db.meta.put({ key: 'demo', value: state })

export const installDemoCap = () => setCreateGuard(demoCapGuard)
