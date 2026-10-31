import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { heroCents, logExpense, unlockAndSetup } from './helpers'

test('a downloaded backup restores the data it was saved with', async ({ page }, testInfo) => {
  // WebKit offers a share sheet for files, which a test can't drive. Without canShare the
  // app falls back to its plain download link, the path every desktop browser takes.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined })
  })
  await unlockAndSetup(page)
  const start = await logExpense(page, '7 tea')
  await expect.poll(() => heroCents(page)).toBe(start - 700)
  const saved = start - 700

  await page.goto('/more/backup')
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Save backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^steady-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const text = await readFile(file, 'utf8')
  expect(JSON.parse(text)).toHaveProperty('schemaVersion')
  // Internal meta never leaves the device (PLAN §7): a backup can't unlock another phone.
  expect(text).not.toContain('unlocked')

  // Change the data after the backup; restoring must take it away again.
  await page.goto('/')
  const beforeShoes = await logExpense(page, '30 shoes')
  await expect.poll(() => heroCents(page)).toBe(beforeShoes - 3000)

  await page.goto('/more/backup')
  await page.getByLabel('Backup file').setInputFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(dialog.getByText('Transactions')).toBeVisible()
  await dialog.getByRole('button', { name: 'Replace my data' }).click()
  await expect(page.getByRole('status')).toContainText('Restored')

  await page.goto('/')
  await expect.poll(() => heroCents(page)).toBe(saved)
})
