// Real unlock check (PLAN §7). Only features/unlock imports this file; the demo build
// aliases it to unlock.stub.ts (vite.config.ts), so no hash ships with the demo.
//
// What the hash does: it keeps valid codes out of the bundle as plain text. It is not
// DRM. Anyone with DevTools can flip the flag, and that is an accepted trade-off.
import { hashCode, isCompleteCode, parseHashes, type CheckResult } from './code'

export * from './code'

export const UNLOCK_REQUIRED = true

/** Rotation list: add a new hash to issue new codes, drop a leaked one later. */
export const VALID_HASHES: readonly string[] = parseHashes(import.meta.env.VITE_UNLOCK_HASHES)

export async function checkCode(
  input: string,
  hashes: readonly string[] = VALID_HASHES,
): Promise<CheckResult> {
  if (!isCompleteCode(input)) return { ok: false, reason: 'incomplete' }
  const hash = await hashCode(input)
  // Only a prefix is persisted: enough to tell which batch a code came from when a
  // hash is retired, without keeping the whole hash on the device.
  return hashes.includes(hash)
    ? { ok: true, hashPrefix: hash.slice(0, 8) }
    : { ok: false, reason: 'wrong' }
}
