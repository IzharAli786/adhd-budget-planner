// Demo stand-in for unlock.ts (PLAN §7). The demo has no lock and must never contain a
// hash: this file reads no env variable and accepts no code.
import type { CheckResult } from './code'

export * from './code'

export const UNLOCK_REQUIRED = false

export const VALID_HASHES: readonly string[] = []

export async function checkCode(input: string, hashes?: readonly string[]): Promise<CheckResult> {
  void input
  void hashes
  return { ok: false, reason: 'wrong' }
}
