import { readFile, stat } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { heroCents, logExpense, unlockAndSetup } from './helpers'

test('makes a PDF report of this month', async ({ page }, testInfo) => {
  // Desktop Chromium has no file share sheet, but make sure: the download path is the one
  // a test can drive (as in backup.spec.ts).
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined })
  })
  await unlockAndSetup(page)
  const start = await logExpense(page, '12 coffee')
  await expect.poll(() => heroCents(page)).toBe(start - 1200)

  await page.goto('/more')
  await page.getByRole('link', { name: /Reports/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible()
  await page
    .getByRole('group', { name: 'Quick ranges' })
    .getByRole('button', { name: 'This month' })
    .click()
  await expect(page.getByRole('region', { name: 'What’s in it' })).toContainText('1 transaction')

  await page.getByRole('button', { name: 'Create PDF' }).click()
  await expect(page.getByText('Your report is ready.')).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(
    /^steady-report-\d{4}-\d{2}-01_to_\d{4}-\d{2}-\d{2}\.pdf$/,
  )
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const bytes = await readFile(file)
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
  expect((await stat(file)).size).toBeGreaterThan(2048)
})
