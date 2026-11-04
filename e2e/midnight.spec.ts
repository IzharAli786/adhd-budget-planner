import { expect, test } from '@playwright/test'
import { unlockAndSetup } from './helpers'

test('an app left open across local midnight moves on to the new day', async ({ page }) => {
  // 23:50 in Berlin, the project's timezoneId. The offset is explicit so the test
  // runner's own zone can't shift it.
  await page.clock.install({ time: new Date('2026-11-02T23:50:00+01:00') })
  // Payday is tomorrow, so Coming up's first row is dated "Nov 3" until midnight.
  await unlockAndSetup(page, { payday: '2026-11-03' })
  const first = page.getByRole('region', { name: 'Coming up' }).getByRole('listitem').first()
  await expect(first).toContainText(/Nov 3|3 Nov/)
  await expect(first).not.toContainText('Today')

  // Past midnight with the app still open: useToday's timer must roll the day over, so
  // the same row now reads "Today".
  await page.clock.runFor('15:00')
  await expect(first).toContainText('Today')
})
