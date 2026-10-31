import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The demo build (PLAN §7) is its own origin: no unlock screen and no service worker.
test('the demo opens straight into setup, with no lock and no service worker', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
  await expect(page.getByLabel('Unlock code')).toHaveCount(0)
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0)

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  )
  expect(serious.map((v) => v.id)).toEqual([])
})
