import { expect, test, type Locator } from '@playwright/test'
import { ensureFullMode, logExpense, unlockAndSetup } from './helpers'

// Phone polish (390 x 844 unless a test says otherwise): tap targets, folded sections,
// envelope entries, chips at the edge, and the side rail on a phone turned sideways.

const fullMode = ensureFullMode

async function box(locator: Locator) {
  const b = await locator.boundingBox()
  if (!b) throw new Error('not rendered')
  return b
}

test('Plan stays short on a phone: secondary sections fold, and remember it', async ({ page }) => {
  await unlockAndSetup(page)
  await fullMode(page)
  await page.goto('/plan')
  await expect(page.getByRole('region', { name: 'This period at a glance' })).toBeVisible()
  for (const name of ['Insights', 'Can this fit?']) {
    const fold = page.getByRole('region', { name }).getByRole('button', { name, exact: true })
    await expect(fold).toHaveAttribute('aria-expanded', 'false')
  }
  const note = page.getByRole('region', { name: 'Note for this month' })
  await expect(note.getByRole('button', { name: 'Note for this month' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  // Open one; it stays open after a reload, the others stay folded.
  const fit = page.getByRole('region', { name: 'Can this fit?' })
  await fit.getByRole('button', { name: 'Can this fit?' }).click()
  await expect(fit.getByRole('textbox', { name: 'Price' })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Can this fit?' }).getByRole('textbox', { name: 'Price' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Insights' }).getByRole('button', { name: 'Insights' }),
  ).toHaveAttribute('aria-expanded', 'false')
})

test('an envelope opens its entries this period, and the log filtered to it', async ({ page }) => {
  await unlockAndSetup(page)
  await fullMode(page)
  await page.goto('/plan')
  // Envelopes are on from setup, with Everyday ready: the starter offer is right there.
  await page.getByRole('button', { name: 'Start with common categories' }).click()
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible()

  await page.goto('/')
  await logExpense(page, '23.50 market @groceries')
  await logExpense(page, '4 coffee')

  await page.goto('/plan')
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Groceries' })
  const list = sheet.getByRole('list', { name: 'Groceries entries' })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('market')
  await expect(sheet).toContainText(/[€£$]23\.50/)
  await sheet.getByRole('link', { name: 'See all in log' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Transactions' })).toBeVisible()
  await expect(
    page.getByRole('group', { name: 'Envelope' }).getByRole('button', { name: 'Groceries' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /market/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /coffee/ })).toHaveCount(0)
})

test('touch targets and lines that must not break at 390px', async ({ page }) => {
  await unlockAndSetup(page)
  await logExpense(page, '5 tea')
  // "See the math" sits on one line.
  const math = page.getByRole('button', { name: 'See the math' })
  expect((await box(math)).height).toBeLessThanOrEqual(48)

  await fullMode(page)
  await page.goto('/goals')
  const days = page.getByRole('list', { name: 'The last 7 days' }).getByRole('button')
  await expect(days).toHaveCount(7)
  for (const day of await days.all()) {
    const b = await box(day)
    expect(b.width).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
  }

  // The months row on the log: the picked chip is wholly in view, never clipped.
  await page.goto('/more/transactions')
  const months = page.getByRole('group', { name: /^Months in/ })
  const first = months.getByRole('button').first()
  await first.click()
  await expect(first).toHaveAttribute('aria-pressed', 'true')
  const row = await box(months)
  const chip = await box(first)
  expect(chip.x).toBeGreaterThanOrEqual(row.x)
  expect(chip.x + chip.width).toBeLessThanOrEqual(row.x + row.width)
})

test('life goals: add one, mark it done, delete it and undo', async ({ page }) => {
  await unlockAndSetup(page)
  await fullMode(page)
  await page.goto('/goals')
  const goals = page.getByRole('region', { name: 'Life goals' })
  await goals.getByRole('button', { name: 'Add a life goal' }).click()
  const sheet = page.getByRole('dialog', { name: 'New life goal' })
  await sheet.getByRole('textbox', { name: 'Goal' }).fill('Learn to drive')
  await sheet.getByRole('textbox', { name: 'Why it matters (optional)' }).fill('Freedom')
  await sheet.getByRole('button', { name: 'Add goal' }).click()
  await expect(goals.getByRole('heading', { name: 'Learn to drive' })).toBeVisible()
  await goals.getByRole('button', { name: 'Start it' }).click()
  await goals.getByRole('button', { name: 'Mark done' }).click()
  await expect(goals).toContainText('1 of 1 done')
  await goals.getByRole('button', { name: 'Edit Learn to drive' }).click()
  await page.getByRole('button', { name: 'Delete goal' }).click()
  await expect(goals.getByRole('heading', { name: 'Learn to drive' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(goals.getByRole('heading', { name: 'Learn to drive' })).toBeVisible()
})

test.describe('a phone on its side', () => {
  test.use({ viewport: { width: 844, height: 390 } })

  test('the side rail scrolls, and the + never covers the last tab', async ({ page }) => {
    await unlockAndSetup(page)
    await fullMode(page)
    await page.goto('/plan')
    const nav = page.getByRole('navigation', { name: 'Main' })
    const last = nav.getByRole('link', { name: 'More' })
    await last.scrollIntoViewIfNeeded()
    const plus = page.getByRole('button', { name: 'Quick add' })
    const a = await box(last)
    const b = await box(plus)
    const overlaps =
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    expect(overlaps).toBe(false)
    await last.click()
    await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  })
})
