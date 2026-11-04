import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

// Guards for polish rules in app.css that jsdom can't lay out or paint (PLAN §8).
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')
const token = (name: string) => new RegExp(`--text-${name}:\\s*([^;]+);`).exec(css)?.[1]

it('sizes the big numbers by their card, not the viewport', () => {
  // On wide screens the hero sits in a narrow column; a vw size would overflow it there.
  for (const name of ['display', 'figure']) {
    expect(token(name)).toMatch(/cqi/)
    expect(token(name)).not.toMatch(/vw/)
  }
})

it('only hides the focus ring on programmatically focused headings', () => {
  // Roving-tabindex controls (segmented, theme swatches, calendar days) use tabindex=-1 too.
  const hiders = [...css.matchAll(/([^{}]*\[tabindex='-1'\][^{}]*)\{[^}]*outline:\s*none/g)]
  expect(hiders.length).toBeGreaterThan(0)
  for (const [, selector] of hiders)
    expect(selector!.trim().split('\n').at(-1)).toMatch(/^:is\(h1, h2, h3\)\[tabindex='-1'\]/)
})

it('stops every animation and transition when motion is reduced or off', () => {
  const reduce = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1]
  expect(reduce).toMatch(/:root:not\(\[data-motion='on'\]\) \*,/)
  expect(reduce).toMatch(/animation: none !important/)
  expect(css).toMatch(/:root\[data-motion='off'\] \*,[\s\S]*?animation: none !important/)
})

it('prints only the report: chrome hidden, the report shown, on white', () => {
  const print = /@media print\s*\{([\s\S]*?)\n\}/.exec(css)?.[1]
  expect(print).toMatch(/nav,[\s\S]*\.print-hide\s*\{\s*display: none !important/)
  expect(print).toMatch(/\.print-report\s*\{\s*display: block !important/)
  expect(print).toMatch(/--bg: #ffffff/)
})

it('keeps a readable focus ring on the inverted toast and on invalid fields', () => {
  // The accent ring measured 1.7-3.1:1 on the toast's text-coloured fill.
  expect(css).toMatch(/\.toast :focus-visible\s*\{\s*outline-color: var\(--bg\)/)
  expect(css).toMatch(
    /\[aria-invalid='true'\]:focus-visible\s*\{\s*outline-color: var\(--tone-attention-fg\)/,
  )
})

it('lets checkboxes and radios keep their own edge and dot while focused', () => {
  // The global halo replaces box-shadow; a checked radio's dot is a box-shadow ring.
  const rule = /input\[type='radio'\]:focus-visible\s*\{([^}]*)\}/.exec(css)?.[1]
  expect(rule).toMatch(/outline-offset: 2px/)
  expect(rule).toMatch(/box-shadow: revert-layer/)
})

it('keeps a focused control clear of the tab bar and the floating + on phones', () => {
  const phones = /@media \(max-width: 47\.999rem\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1]
  expect(phones).toMatch(/scroll-padding-bottom: calc\(9\.25rem/)
  expect(phones).toMatch(/scroll-padding-top: calc\(var\(--demo-banner-h/)
})

it('defines the shared type utilities', () => {
  for (const name of ['section-title', 'card-title', 'amount'])
    expect(css).toMatch(new RegExp(`@utility ${name} \\{[^}]*font-family: var\\(--font-display\\)`))
})
