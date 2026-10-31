import { expect, test } from '@playwright/test'
import { unlockAndSetup } from './helpers'

test('add a monthly bill, mark it paid, undo', async ({ page }) => {
  await unlockAndSetup(page)
  await page.getByRole('link', { name: 'Bills' }).first().click()

  await page.getByRole('button', { name: 'Add your first bill' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add a bill' })
  await sheet.getByLabel('Name').fill('Rent')
  await sheet.getByLabel('Amount').fill('650')
  // "Monthly" is the default; its accessible name is the full "Every month".
  await expect(sheet.getByRole('radio', { name: 'Every month' })).toBeChecked()
  await sheet.getByRole('button', { name: 'Add bill' }).click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText(/650\.00 · Every month/)).toBeVisible()

  // A monthly bill can show in this period and in "Later": act on the first one.
  await page.getByRole('button', { name: 'Mark Rent paid' }).first().click()
  await expect(page.getByRole('status')).toContainText('Rent marked paid')
  await expect(page.getByRole('button', { name: 'Mark Rent as not paid' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('button', { name: 'Mark Rent as not paid' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark Rent paid' }).first()).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})
