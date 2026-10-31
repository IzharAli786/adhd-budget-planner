// Key/value rows for settings and app bookkeeping. Some keys are INTERNAL: they describe
// this install (unlock state, nag counters), not the user's money, so backups never carry
// them and a restore never overwrites them.
import { withDefaults, type Settings } from '../../domain/settings'
import { db } from '../schema'
import { mutate } from '../undo'

export type MetaKey =
  | 'settings'
  | 'setupProgress'
  | 'lastOpened'
  | 'lastBackupAt'
  | 'gardenPoints'
  | 'unlocked'
  | 'changesSinceBackup'
  | `snoozes${string}`

const INTERNAL_PREFIXES = ['unlocked', 'changesSinceBackup', 'snoozes'] as const

export const isInternalMetaKey = (key: string) => INTERNAL_PREFIXES.some((p) => key.startsWith(p))

/**
 * The keys a backup may carry. An allow-list, not "everything but internal": a key added
 * later (or typed into a file by hand) must be opted in, never leak out or in by default.
 */
export const EXPORTED_META_KEYS = [
  'settings',
  'setupProgress',
  'lastOpened',
  'lastBackupAt',
  'gardenPoints',
] as const satisfies readonly MetaKey[]

export const isExportedMetaKey = (key: string) =>
  (EXPORTED_META_KEYS as readonly string[]).includes(key)

export async function getMeta<T>(key: MetaKey): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined
}

/** Not undoable: bookkeeping writes would otherwise push real user actions out of the log. */
export function setMeta(key: MetaKey, value: unknown) {
  return mutate(null, ['meta'], (w) => w.put('meta', { key, value }))
}

export function deleteMeta(key: MetaKey) {
  return mutate(null, ['meta'], (w) => w.delete('meta', key))
}

/** A backup was saved: stamp it and start counting changes again, in one write. */
export function recordBackup(at: string = new Date().toISOString()) {
  return mutate(null, ['meta'], async (w) => {
    await w.put('meta', { key: 'lastBackupAt', value: at })
    await w.put('meta', { key: 'changesSinceBackup', value: 0 })
  })
}

export const getChangesSinceBackup = async () => (await getMeta<number>('changesSinceBackup')) ?? 0

export async function getSettings(): Promise<Settings> {
  return withDefaults(await getMeta<Partial<Settings>>('settings'))
}

export function updateSettings(patch: Partial<Settings>) {
  return mutate(null, ['meta'], async (w) => {
    const current = withDefaults((await w.get('meta', 'settings'))?.value as Partial<Settings>)
    const next = { ...current, ...patch }
    await w.put('meta', { key: 'settings', value: next })
    return next
  })
}
