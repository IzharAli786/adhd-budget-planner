import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addFirstBill, logExpense, unlockAndSetup } from './helpers'

const SCREENS = [
  { path: '/', heading: 'Today' },
  { path: '/plan', heading: 'Plan' },
  { path: '/bills', heading: 'Bills' },
  { path: '/goals', heading: 'Goals' },
  { path: '/more', heading: 'More' },
  { path: '/more/settings', heading: 'Appearance & settings' },
  { path: '/more/transactions', heading: 'Transactions' },
  { path: '/more/backup', heading: 'Backup & restore' },
  { path: '/more/review', heading: 'Look back' },
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
    test.setTimeout(180_000) // ten full axe scans
    // Reduced motion, or axe can read colours halfway through a fade-in.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await unlockAndSetup(page)
    // Scan screens with something on them: empty states alone would skip bill rows,
    // repeat chips and the calendar's bill dots.
    await logExpense(page, '12 coffee')
    await page.getByRole('link', { name: 'Bills' }).first().click()
    await addFirstBill(page, 'Rent', '650')

    await page.goto('/more')
    await page.getByRole('switch', { name: 'Show more tools' }).click()
    await expect(page.getByRole('link', { name: 'Goals' }).first()).toBeVisible()

    for (const screen of SCREENS) {
      await page.goto(screen.path)
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeAttached()
      // Skeletons are aria-hidden placeholders; scan the real screen, not the loading one.
      await expect(page.locator('[aria-busy="true"], .animate-pulse')).toHaveCount(0)
      expect(await seriousViolations(page), `${screen.path} (${colorScheme})`).toEqual([])
    }

    // The math breakdown is a sheet, not a route, but it is the core explanation. "Every
    // line" so the per-item lists are on screen too.
    await page.goto('/')
    await page.getByRole('button', { name: 'See the math' }).click()
    const sheet = page.getByRole('dialog', { name: 'How this number works' })
    await sheet.getByRole('radio', { name: 'Every line' }).click()
    await expect(sheet.locator('dd ul').first()).toBeVisible()
    expect(await seriousViolations(page), `math sheet (${colorScheme})`).toEqual([])
  })
}
