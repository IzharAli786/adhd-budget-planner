// Demo bundle leak check (PLAN §7, §9 "Bundle"): the demo must ship no unlock hash.
// Run by `npm run build:demo`, so CI fails on a leak instead of a buyer finding one.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const files = readdirSync(dist, { recursive: true, withFileTypes: true })
  .filter((d) => d.isFile() && /\.(js|html|css|json|webmanifest|map)$/.test(d.name))
  .map((d) => join(d.parentPath, d.name))

if (files.length === 0) {
  console.error(`check-demo: no files in ${dist}. Build the demo first.`)
  process.exit(1)
}

const leaks = []
for (const file of files) {
  // A sha256 in hex is exactly 64 hex characters, with no hex character on either side.
  for (const m of readFileSync(file, 'utf8').matchAll(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/gi)) {
    leaks.push(`${file}: hash-shaped string ${m[0].slice(0, 12)}…`)
  }
}

if (leaks.length) {
  console.error(`check-demo: the demo bundle leaks unlock data:\n  ${leaks.join('\n  ')}`)
  process.exit(1)
}
console.log(`check-demo: ${files.length} files, no hash-shaped strings`)
