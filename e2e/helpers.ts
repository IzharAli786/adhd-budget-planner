import { expect, type Locator, type Page } from '@playwright/test'

export const DEV_CODE = 'STEADY-DEMO-0000-0000-0001'

export interface SetupOptions {
  /** 'YYYY-MM-DD'; defaults to the first suggested payday chip. */
  payday?: string
  pay?: string
  balance?: string
}

/**
 * Today's main number: the "{Month} safe to spend" tile, the first tile in "At a glance"
 * ("€46.67"). Today no longer has a per-day hero; this tile is what spending moves.
 */
export function hero(page: Page): Locator {
  return safeTile(page).locator('p').last()
}

function safeTile(page: Page): Locator {
  return page.getByRole('list', { name: 'At a glance' }).getByRole('listitem').first()
}

/**
 * Signed: a short month reads "{Month} short by €5.00" with a plain amount. Reading that
 * as +500 would let a "lowers by exactly" check pass on a number that went the wrong way
 * past zero.
 */
export async function heroCents(page: Page): Promise<number> {
  const text = (await hero(page).textContent()) ?? ''
  const cents = Number(text.replace(/[^\d]/g, ''))
  const label = (await safeTile(page).textContent()) ?? ''
  return /\bshort\b/.test(label) ? -cents : cents
}

/** Unlock with the dev code and answer the four setup steps, ending on Today. */
export async function unlockAndSetup(page: Page, opts: SetupOptions = {}) {
  await page.goto('/')
  await page.getByLabel('Unlock code').fill(DEV_CODE)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await answerSetup(page, opts)
}

/** The four setup steps from the disclaimer on; the demo starts here with no lock. */
export async function answerSetup(page: Page, opts: SetupOptions = {}) {
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

/**
 * Logs spending the way a person does now: the floating "Track spending" button, then
 * amount, what for and (from an "@tag" in the text) the envelope. Accepts the short form
 * "23.50 market @groceries" so specs stay readable. Returns Today's number before it.
 */
export async function logExpense(page: Page, text: string) {
  const before = await heroCents(page)
  const m = /^([\d.,]+)\s*(.*?)(?:\s+@(\S+))?$/.exec(text.trim())
  if (!m) throw new Error(`logExpense: can't read "${text}"`)
  const [, amount, note, tag] = m
  await page.getByRole('button', { name: 'Track spending' }).click()
  const sheet = page.getByRole('dialog', { name: 'Track spending' })
  await sheet.getByLabel('Amount').fill(amount!)
  if (note) await sheet.getByLabel(/What for/).fill(note)
  if (tag)
    await sheet
      .getByRole('group', { name: 'Envelope' })
      .getByRole('button', { name: new RegExp(`^${tag}`, 'i') })
      .first()
      .click()
  await sheet.getByRole('button', { name: 'Log it' }).click()
  await expect(sheet).toBeHidden()
  return before
}

/** From Bills with no bills yet: add one monthly bill through the sheet. */
export async function addFirstBill(page: Page, name: string, amount: string) {
  await page.getByRole('button', { name: 'Add your first bill' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add a bill' })
  await sheet.getByLabel('Name').fill(name)
  await sheet.getByLabel('Amount').fill(amount)
  await sheet.getByRole('button', { name: 'Add bill' }).click()
  await expect(sheet).toBeHidden()
}

/** Plan and Goals on. Checks the switch instead of clicking blind, so it holds whatever the default. */
export async function ensureFullMode(page: Page) {
  await page.goto('/more')
  const toggle = page.getByRole('switch', { name: 'Show more tools' })
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
}
