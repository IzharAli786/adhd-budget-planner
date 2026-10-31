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
