// Makes an unlock code and the hash that goes into VITE_UNLOCK_HASHES (PLAN §7).
//
//   node scripts/make-code.mjs                 a new random code + its hash
//   node scripts/make-code.mjs STEADY-XXXX-…   the hash of an existing code
//
// Normalising must match src/unlock/code.ts exactly (a test checks the dev code's hash
// in .env against the app's own hashCode, which catches drift in either file).
import { createHash, randomBytes } from 'node:crypto'

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const PREFIX = 'STEADY'

function body(input) {
  let s = input.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (s.startsWith(PREFIX)) s = s.slice(PREFIX.length)
  return s.replace(/O/g, '0').replace(/[IL]/g, '1')
}

function randomBody() {
  for (;;) {
    // 32 symbols divide 256 evenly, so `byte & 31` has no modulo bias.
    const chars = Array.from(randomBytes(16), (b) => CROCKFORD[b & 31]).join('')
    // The app strips a leading STEADY, so such a body could never be entered.
    if (!chars.startsWith(PREFIX)) return chars
  }
}

const given = process.argv[2]
const b = given ? body(given) : randomBody()
if (!new RegExp(`^[${CROCKFORD}]{16}$`).test(b)) {
  console.error(`Not a valid code: expected 16 Crockford characters after STEADY, got "${b}"`)
  process.exit(1)
}
const code = `${PREFIX}-${b.match(/.{4}/g).join('-')}`
const hash = createHash('sha256').update(`steady-v1:${PREFIX}${b}`).digest('hex')
console.log(`code: ${code}`)
console.log(`hash: ${hash}`)
