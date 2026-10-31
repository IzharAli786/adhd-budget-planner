import { expect, type Locator, type Page } from '@playwright/test'

export const DEV_CODE = 'STEADY-DEMO-0000-0000-0001'

export interface SetupOptions {
  /** 'YYYY-MM-DD'; defaults to the first suggested payday chip. */
  payday?: string
  pay?: string
  balance?: string
}

/** The hero number on Today ("€46.67"), as cents. The app always shows two decimals. */
export function hero(page: Page): Locator {
  return page.getByRole('region', { name: 'Today’s number' }).locator('p[aria-live="polite"]')
}

export async function heroCents(page: Page): Promise<number> {
  const text = (await hero(page).textContent()) ?? ''
  return Number(text.replace(/[^\d]/g, ''))
}

/** Unlock with the dev code and answer the four setup steps, ending on Today. */
export async function unlockAndSetup(page: Page, opts: SetupOptions = {}) {
  await page.goto('/')
  await page.getByLabel('Unlock code').fill(DEV_CODE)
  await page.getByRole('button', { name: 'Unlock' }).click()

  await page.getByRole('button', { name: 'I understand' }).click()

  await expect(page.getByRole('heading', { name: 'When do you next get paid?' })).toBeVisible()
  if (opts.payday) await page.getByLabel('Or pick the date').fill(opts.payday)
  else await page.getByRole('group', { name: 'Common paydays' }).getByRole('button').first().click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'How often, and how much?' })).toBeVisible()
  await page.getByLabel('How much lands each time?').fill(opts.pay ?? '2000')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(
    page.getByRole('heading', { name: 'What’s in your account right now?' }),
  ).toBeVisible()
  await page.getByLabel('Balance today').fill(opts.balance ?? '900')
  await page.getByRole('button', { name: 'Show my number' }).click()

  await expect(hero(page)).toHaveText(/\d/)
}

export function quickAdd(page: Page): Locator {
  return page.getByRole('textbox', { name: /Quick add/ })
}

export async function logExpense(page: Page, text: string) {
  const before = await heroCents(page)
  await quickAdd(page).fill(text)
  await quickAdd(page).press('Enter')
  await expect(quickAdd(page)).toHaveValue('')
  return before
}
