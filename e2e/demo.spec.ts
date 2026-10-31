import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { answerSetup, hero } from './helpers'

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id)
}

// The demo build (PLAN §7) is its own origin: no unlock screen and no service worker.
test('the demo opens with two ways in, no lock and no service worker', async ({ page }) => {
  // As in a11y.spec: axe must not read colours halfway through a fade-in.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Try Steady' })).toBeVisible()
  await expect(page.getByLabel('Unlock code')).toHaveCount(0)
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('button', { name: /Try with my own numbers/ }).click()
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
  await expect(page.getByLabel('Unlock code')).toHaveCount(0)
  expect(await seriousViolations(page)).toEqual([])

  // The full app only registers its SW from the shell, after setup: checking on the setup
  // screen would pass for the full app too. Reach Today, where it would have registered.
  await answerSetup(page)
  await expect(hero(page)).toHaveText(/\d/)
  await page.waitForLoadState('load')

  // No SW script and no manifest are shipped at all, so nothing can ever register.
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
  const sw = await page.request.get('/sw.js')
  expect(sw.headers()['content-type'] ?? '').not.toContain('javascript')
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0)

  expect(await seriousViolations(page)).toEqual([])
})

test('sample data opens a filled-in Today', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: /Look around with sample data/ }).click()
  await expect(hero(page)).toHaveText(/\d/)
  expect(await seriousViolations(page)).toEqual([])
})
