import { expect, test } from '@playwright/test'
import { unlockAndSetup } from './helpers'

test('an app left open across local midnight moves on to the new day', async ({ page }) => {
  // 23:50 in Berlin, the project's timezoneId. The offset is explicit so the test
  // runner's own zone can't shift it.
  await page.clock.install({ time: new Date('2026-11-02T23:50:00+01:00') })
  await unlockAndSetup(page, { payday: '2026-11-20' })

  // Planning by month: 2 Nov to 30 Nov, today counted.
  await expect(page.getByText(/^29 days left/)).toBeVisible()

  // Past midnight with the app still open: useToday's timer must roll the day over.
  await page.clock.runFor('15:00')
  await expect(page.getByText(/^28 days left/)).toBeVisible()
})
