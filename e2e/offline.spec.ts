import { expect, test } from '@playwright/test'
import { heroCents, logExpense, unlockAndSetup } from './helpers'

test('works offline once the service worker is ready', async ({ page, context, browserName }) => {
  // PLAN §9: offline E2E runs in Chromium only.
  test.skip(browserName !== 'chromium', 'Chromium only')

  await unlockAndSetup(page)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // The first page load is never controlled by a new SW; after a reload it is.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect.poll(() => heroCents(page)).toBeGreaterThan(0)

  const before = await logExpense(page, '4.50 bus')
  await expect.poll(() => heroCents(page)).toBe(before - 450)

  await page.reload()
  await expect.poll(() => heroCents(page)).toBe(before - 450)
  await context.setOffline(false)
})
