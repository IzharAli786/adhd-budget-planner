import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addFirstBill, ensureFullMode, logExpense, unlockAndSetup } from './helpers'

const SCREENS: { path: string; heading: string | RegExp }[] = [
  { path: '/getting-started', heading: 'Getting started' },
  { path: '/home', heading: 'Home' },
  // Today's title is the greeting ("Good evening", or "Good evening, Sam").
  { path: '/', heading: /^Good (morning|afternoon|evening)/ },
  { path: '/bills', heading: 'Calendar' },
  { path: '/goals', heading: 'Goals' },
  { path: '/savings', heading: 'Savings' },
  { path: '/debt', heading: 'Debt' },
  { path: '/envelopes', heading: 'Envelopes' },
  { path: '/review', heading: 'Yearly review' },
  { path: '/more', heading: 'More' },
  { path: '/more/settings', heading: 'Settings' },
  { path: '/more/basics', heading: 'Money basics' },
  { path: '/more/transactions', heading: 'Transactions' },
  { path: '/more/backup', heading: 'Backup & restore' },
  { path: '/more/help', heading: 'How each part works' },
]

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }))
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`no serious axe violations on each tab, Full mode, ${colorScheme}`, async ({ page }) => {
    test.setTimeout(300_000) // fifteen full axe scans
    // Reduced motion, or axe can read colours halfway through a fade-in.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await unlockAndSetup(page)
    // Scan screens with something on them: empty states alone would skip bill rows,
    // repeat chips and the calendar's bill dots.
    await logExpense(page, '12 coffee')
    await page.getByRole('link', { name: 'Calendar' }).first().click()
    await addFirstBill(page, 'Rent', '650')

    await ensureFullMode(page)
    await expect(page.getByRole('link', { name: 'Goals' }).first()).toBeVisible()

    for (const screen of SCREENS) {
      await page.goto(screen.path)
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeAttached()
      // Skeletons are aria-hidden placeholders; scan the real screen, not the loading one.
      await expect(page.locator('[aria-busy="true"], .animate-pulse')).toHaveCount(0)
      expect(await seriousViolations(page), `${screen.path} (${colorScheme})`).toEqual([])
      // The desktop grids must collapse cleanly: nothing wider than a 390px phone.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `${screen.path} scrolls sideways`).toBeLessThanOrEqual(0)
    }

    // The math breakdown is a sheet, not a route, but it is the core explanation (opened
    // from Home's "Left to spend"). "Every line" so the per-item lists are on screen too.
    await page.goto('/home')
    await page.getByRole('button', { name: 'See the math' }).click()
    const sheet = page.getByRole('dialog', { name: 'How this number works' })
    await sheet.getByRole('radio', { name: 'Every line' }).click()
    await expect(sheet.locator('dd ul').first()).toBeVisible()
    expect(await seriousViolations(page), `math sheet (${colorScheme})`).toEqual([])
  })
}
