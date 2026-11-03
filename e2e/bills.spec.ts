import { expect, test } from '@playwright/test'
import { addFirstBill, unlockAndSetup } from './helpers'

test('add a monthly bill, mark it paid, undo', async ({ page }) => {
  await unlockAndSetup(page)
  await page.getByRole('link', { name: 'Calendar' }).first().click()

  await addFirstBill(page, 'Rent', '650')
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
