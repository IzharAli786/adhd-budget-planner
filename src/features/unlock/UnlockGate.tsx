import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { getMeta, setMeta } from '../../db/repos'
import type { Instant } from '../../domain/types'
import { UNLOCK_REQUIRED } from '../../unlock/unlock'
import { UnlockScreen } from './UnlockScreen'

/**
 * meta.unlocked is the single source of truth (PLAN §7): not mirrored to localStorage,
 * never exported, never restored, so a backup can't unlock another device.
 */
export interface UnlockState {
  at: Instant
  hashPrefix: string
}

export const markUnlocked = (hashPrefix: string, at: Instant = new Date().toISOString()) =>
  setMeta('unlocked', { at, hashPrefix } satisfies UnlockState)

const isUnlockState = (v: unknown): v is UnlockState =>
  typeof v === 'object' && v !== null && typeof (v as UnlockState).at === 'string'

/** Full lock: nothing of the app renders until a valid code was entered once. */
export function UnlockGate({ children }: { children: ReactNode }) {
  const unlocked = useLiveQuery(async () => isUnlockState(await getMeta('unlocked')))
  if (!UNLOCK_REQUIRED) return children
  // A few ms on boot; the Boot screen just faded out, so a blank frame reads as calm.
  if (unlocked === undefined) return null
  return unlocked ? children : <UnlockScreen onUnlock={markUnlocked} />
}
