// Demo bundle leak check (PLAN §7, §9 "Bundle"). Run by `npm run build:demo`, so CI
// fails on a leak instead of a buyer finding one. The demo must ship:
//   - no unlock hash: not the dev code's, not any VITE_UNLOCK_HASHES value from an env
//     file or the CI environment, and nothing else hash-shaped either;
//   - not the dev unlock code itself, in any spelling;
//   - no service worker or manifest (the demo is never installed, PLAN §7).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist-demo'
if (!existsSync(dist)) {
  console.error(`check-demo: ${dist} does not exist. Build the demo first (npm run build:demo).`)
  process.exit(1)
}

const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(js|mjs|html|css|json|webmanifest|map|txt|svg)$/.test(d.name))
  .map((d) => join(d.parentPath, d.name))

if (files.length === 0) {
  console.error(`check-demo: no files in ${dist}. Build the demo first.`)
  process.exit(1)
}

// Same normalisation and salt as src/unlock/code.ts (hashCode).
const DEV_CODE = 'STEADY-DEMO-0000-0000-0001'
const devRaw = DEV_CODE.toUpperCase().replace(/[^0-9A-Z]/g, '') // as typed: STEADYDEMO…
const devBody = devRaw.slice('STEADY'.length).replace(/[OIL]/g, (c) => (c === 'O' ? '0' : '1'))
const devHash = createHash('sha256').update(`steady-v1:STEADY${devBody}`).digest('hex')

// Every hash any env could hand to a build: the env files and the CI environment.
const hashes = new Map([[devHash, 'the dev unlock code']])
const envFiles = readdirSync('.').filter((f) => /^\.env(\..+)?$/.test(f))
const sources = [
  ...envFiles.map((f) => [f, readFileSync(f, 'utf8')]),
  ['process.env', `VITE_UNLOCK_HASHES=${process.env.VITE_UNLOCK_HASHES ?? ''}`],
]
for (const [where, text] of sources) {
  for (const line of text.split('\n')) {
    const m = /^\s*VITE_UNLOCK_HASHES\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    for (const h of m[1].replace(/["']/g, '').split(',')) {
      const hash = h.trim().toLowerCase()
      if (hash) hashes.set(hash, `VITE_UNLOCK_HASHES in ${where}`)
    }
  }
}

const leaks = []
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const lower = text.toLowerCase()
  for (const [hash, where] of hashes) {
    // Prefixes too: the app stores an 8-character prefix, so a 12-character one is a leak.
    if (lower.includes(hash) || (hash.length >= 12 && lower.includes(hash.slice(0, 12)))) {
      leaks.push(`${file}: ${where} (${hash.slice(0, 8)}…)`)
    }
  }
  const squashed = text.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (squashed.includes(devRaw) || squashed.includes(`STEADY${devBody}`)) {
    leaks.push(`${file}: the dev unlock code in plain text`)
  }
  // A sha256 in hex is exactly 64 hex characters, with no hex character on either side.
  for (const m of text.matchAll(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gi)) {
    leaks.push(`${file}: hash-shaped string ${m[0].slice(0, 12)}…`)
  }
}

for (const name of ['sw.js', 'registerSW.js', 'manifest.webmanifest']) {
  if (existsSync(join(dist, name))) leaks.push(`${dist}/${name}: the demo must not be installable`)
}

if (leaks.length) {
  console.error(
    `check-demo: the demo bundle leaks unlock data:\n  ${[...new Set(leaks)].join('\n  ')}`,
  )
  process.exit(1)
}
console.log(
  `check-demo: ${files.length} files in ${dist}, none of ${hashes.size} known hash(es), no hash-shaped strings, no service worker`,
)
