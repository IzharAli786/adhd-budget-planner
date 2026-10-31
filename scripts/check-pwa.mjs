// Post-build PWA validity check (PLAN §10 M3). A broken manifest or a precache entry
// that 404s only shows up as "Add to Home Screen" silently doing nothing, or as an SW
// that never installs, so the build fails here instead of on someone's phone.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = process.argv[2] ?? 'dist'
const errors = []
const check = (ok, message) => ok || errors.push(message)
const read = (file) => readFileSync(join(dist, file))

// PNG: width and height are big-endian uint32 at bytes 16 and 20 of the IHDR chunk.
function pngSize(file) {
  const buf = read(file)
  if (buf.toString('ascii', 1, 4) !== 'PNG') return null
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`
}

const manifest = JSON.parse(read('manifest.webmanifest').toString())
for (const [key, want] of Object.entries({
  short_name: 'Steady',
  display: 'standalone',
  start_url: '/?source=pwa',
  scope: '/',
})) {
  check(manifest[key] === want, `manifest.${key} is ${manifest[key]}, expected ${want}`)
}
check(/^#[0-9a-f]{6}$/i.test(manifest.background_color ?? ''), 'manifest.background_color')
check(manifest.name, 'manifest.name is missing')

for (const icon of manifest.icons ?? []) {
  if (!existsSync(join(dist, icon.src))) {
    errors.push(`icon ${icon.src} is missing from ${dist}`)
    continue
  }
  const size = pngSize(icon.src)
  check(size === icon.sizes, `icon ${icon.src} is ${size}, manifest says ${icon.sizes}`)
}
const sizes = (manifest.icons ?? []).map((i) => `${i.sizes}${i.purpose === 'maskable' ? 'm' : ''}`)
for (const need of ['192x192', '512x512', '512x512m']) {
  check(sizes.includes(need), `manifest needs a ${need.replace('m', ' maskable')} icon`)
}

const html = read('index.html').toString()
check(html.includes('rel="manifest"'), 'index.html does not link the manifest')
const touch = /rel="apple-touch-icon" href="\/([^"]+)"/.exec(html)?.[1]
check(touch && pngSize(touch) === '180x180', `apple-touch-icon ${touch} must be a 180x180 PNG`)

const sw = read('sw.js').toString()
const precached = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
check(precached.includes('index.html'), 'index.html is not precached (offline start breaks)')
check(
  precached.some((u) => u.endsWith('.woff2')),
  'the font is not precached (offline text falls back)',
)
// Both faces: Inter for text, Fraunces for titles and hero numbers.
for (const face of ['inter-latin-wght', 'fraunces-latin-opsz']) {
  check(
    precached.some((u) => u.includes(face) && u.endsWith('.woff2')),
    `${face} is not precached (offline type falls back)`,
  )
}
for (const url of new Set(precached)) check(existsSync(join(dist, url)), `precached ${url} 404s`)
check(new Set(precached).size === precached.length, 'precache lists a file twice')
check(sw.includes('createHandlerBoundToURL("/index.html")'), 'navigateFallback is not /index.html')
// registerType 'prompt': the new SW may only skip waiting when the user taps Refresh.
check(!/[;,{]\s*self\.skipWaiting\(\)/.test(sw), 'sw.js skips waiting unprompted')
check(!sw.includes('clientsClaim'), 'sw.js claims clients unprompted')
for (const js of html.matchAll(/src="\/(assets\/[^"]+\.js)"/g)) {
  check(precached.includes(js[1]), `entry chunk ${js[1]} is not precached`)
}

if (errors.length) {
  console.error(`PWA check failed (${dist}):\n  - ${errors.join('\n  - ')}`)
  process.exit(1)
}
console.log(
  `PWA check passed: manifest, ${manifest.icons.length} icons, ${precached.length} precached files.`,
)
