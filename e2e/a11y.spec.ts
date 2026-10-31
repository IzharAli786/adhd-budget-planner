import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { unlockAndSetup } from './helpers'

const SCREENS = [
  { path: '/', heading: 'Today' },
  { path: '/bills', heading: 'Bills' },
  { path: '/goals', heading: 'Goals' },
  { path: '/more', heading: 'More' },
  { path: '/more/settings', heading: 'Appearance & settings' },
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
    test.setTimeout(120_000) // five full axe scans
    // Reduced motion, or axe can read colours halfway through a fade-in.
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await unlockAndSetup(page)

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
  })
}
