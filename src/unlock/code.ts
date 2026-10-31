// Unlock code format (PLAN §7): STEADY-XXXX-XXXX-XXXX-XXXX, 16 Crockford base32 chars
// (about 80 bits). This file holds no hashes, so the demo stub can share it.

export const CODE_PREFIX = 'STEADY'
export const CODE_LENGTH = 16
/** Crockford base32: no I, L, O or U, so a code survives being read aloud or retyped. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

// Crockford's decode aliases: people type the letter for the digit it looks like.
const ALIASES: Record<string, string> = { O: '0', I: '1', L: '1' }

export type CheckResult =
  { ok: true; hashPrefix: string } | { ok: false; reason: 'incomplete' | 'wrong' }

/**
 * The code characters, however they were typed or pasted: any case, spaces, dashes
 * (including the typographic ones a PDF viewer may paste), with or without "STEADY".
 */
export function codeBody(input: string): string {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, '')
  // A random body starting with STEADY is a 1-in-a-billion event (and make-code skips it).
  if (s.startsWith(CODE_PREFIX)) s = s.slice(CODE_PREFIX.length)
  return s.replace(/[OIL]/g, (c) => ALIASES[c]!)
}

/** The canonical form that gets hashed: 'STEADY' + the body characters. */
export const normalizeCode = (input: string) => CODE_PREFIX + codeBody(input)

const COMPLETE = new RegExp(`^[${CROCKFORD}]{${CODE_LENGTH}}$`)
export const isCompleteCode = (input: string) => COMPLETE.test(codeBody(input))

/** What the input field shows: the body in groups of four, e.g. "DEM0-0000-00". */
export function formatCodeBody(input: string): string {
  const body = codeBody(input).slice(0, CODE_LENGTH)
  return body.match(/.{1,4}/g)?.join('-') ?? ''
}

export async function sha256hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The versioned salt means a future code format can't collide with today's hashes. */
export const hashCode = (input: string) => sha256hex(`steady-v1:${normalizeCode(input)}`)

/** "abc, DEF ,," -> ['abc', 'def']; empty or missing env gives no valid codes at all. */
export function parseHashes(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^[0-9a-f]{64}$/.test(h))
}
