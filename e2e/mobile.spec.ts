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

test('Home on a phone: the charts in the competitor’s order, one column, nothing sideways', async ({
  page,
}) => {
  await unlockAndSetup(page)
  await fullMode(page)
  await page.goto('/home')
  const titles = page.getByRole('main').getByRole('heading', { level: 2 })
  await expect(titles).toHaveText([
    'Income vs spending',
    /^Budget vs\. actuals/,
    'Spending distribution',
    'Left to spend',
    /^Notes for this/,
  ])
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('an envelope card lists its own entries this month, with Edit and ×', async ({ page }) => {
  await unlockAndSetup(page)
  await fullMode(page)
  await page.goto('/envelopes')
  await page.getByRole('button', { name: 'Start with common categories' }).click()
  await expect(page.getByRole('heading', { name: 'Groceries' })).toBeVisible()

  await page.goto('/')
  await logExpense(page, '23.50 market @groceries')
  await logExpense(page, '4 coffee')

  await page.goto('/envelopes')
  const card = page.getByRole('region', { name: 'Groceries' })
  const list = card.getByRole('list', { name: /^Groceries in / })
  await expect(list.getByRole('listitem')).toHaveCount(1)
  await expect(list).toContainText('market')
  await expect(card).toContainText(/[€£$]23\.50/)
  await expect(list.getByRole('button', { name: 'Edit market' })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Delete market' })).toBeVisible()
  // Untagged spending lands in Everyday, not Groceries.
  await expect(card).not.toContainText('coffee')
})

test('touch targets and lines that must not break at 390px', async ({ page }) => {
  await unlockAndSetup(page)
  await logExpense(page, '5 tea')
  // The floating "Track spending" button is a full-size target.
  const track = await box(page.getByRole('button', { name: 'Track spending' }))
  expect(track.width).toBeGreaterThanOrEqual(44)
  expect(track.height).toBeGreaterThanOrEqual(44)

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
    await page.goto('/home')
    const nav = page.getByRole('navigation', { name: 'Main' })
    const last = nav.getByRole('link', { name: 'More' })
    await last.scrollIntoViewIfNeeded()
    const plus = page.getByRole('button', { name: 'Track spending' })
    const a = await box(last)
    const b = await box(plus)
    const overlaps =
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    expect(overlaps).toBe(false)
    await last.click()
    await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible()
  })
})
