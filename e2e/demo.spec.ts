import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { answerSetup, hero, heroCents } from './helpers'

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => v.id)
}

// The demo build (PLAN §7) is its own origin: no unlock screen and no service worker.
test('the demo opens with two ways in, no lock and no service worker', async ({ page }) => {
  // As in a11y.spec: axe must not read colours halfway through a fade-in.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Try Steady' })).toBeVisible()
  await expect(page.getByLabel('Unlock code')).toHaveCount(0)
  expect(await seriousViolations(page)).toEqual([])

  await page.getByRole('button', { name: /Try with my own numbers/ }).click()
  await expect(page.getByRole('heading', { name: 'Before we start' })).toBeVisible()
  await expect(page.getByLabel('Unlock code')).toHaveCount(0)
  expect(await seriousViolations(page)).toEqual([])

  // The full app only registers its SW from the shell, after setup: checking on the setup
  // screen would pass for the full app too. Reach Today, where it would have registered.
  await answerSetup(page)
  await expect(hero(page)).toHaveText(/\d/)
  await page.waitForLoadState('load')

  // No SW script and no manifest are shipped at all, so nothing can ever register.
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0)
  const sw = await page.request.get('/sw.js')
  expect(sw.headers()['content-type'] ?? '').not.toContain('javascript')
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0)

  expect(await seriousViolations(page)).toEqual([])
})

test('sample data opens a filled-in Today', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: /Look around with sample data/ }).click()
  await expect(hero(page)).toHaveText(/\d/)
  // Months of history behind it, and still a calm, positive number for today.
  expect(await heroCents(page)).toBeGreaterThan(0)
  // Greeted by name, with the money laid out; never a backup chore in the demo.
  await expect(page.getByRole('heading', { level: 1, name: 'Hi Sam' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Coming up' })).toBeVisible()
  await expect(page.getByText('Save a backup')).toHaveCount(0)
  expect(await seriousViolations(page)).toEqual([])
})

test('sample data fills Home’s charts and the Yearly review', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: /Look around with sample data/ }).click()
  await expect(hero(page)).toHaveText(/\d/)

  // Home: budget vs actuals, where the money went and what's left, from one engine.
  await page.getByRole('link', { name: 'Home' }).first().click()
  await expect(page.getByRole('list', { name: /^Budget vs\.? actual/ })).toBeVisible()
  const dist = page.getByRole('list', { name: 'Spending distribution' })
  await expect(dist.getByText('Rent & housing')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Left to spend' })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])

  // Yearly review: months of money in and out, carry-over per payday, savings and debt.
  // On a phone it isn't in the bottom bar: More lists every section that isn't.
  await page.getByRole('link', { name: 'More' }).first().click()
  await page
    .getByRole('main')
    .getByRole('link', { name: /Yearly review/ })
    .click()
  await expect(page.getByRole('region', { name: 'Savings this year' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Debt this year' })).toBeVisible()
  // A good year: money left over, and the two payoff orders really differ in cost.
  const glance = page.getByRole('region', { name: /at a glance$/ })
  await expect(glance.getByText('Left over', { exact: true })).toBeVisible()
  await expect(glance.getByText('Avalanche could save')).toBeVisible()
  await expect(page.getByText(/Interest paid this year \(estimate\)/).first()).toBeVisible()
  await expect(page.getByText(/\+\s*[−-]/)).toHaveCount(0)
  // A phone gets one card per month instead of a table that scrolls sideways.
  const months = page.getByRole('list', { name: 'Months' }).getByRole('listitem')
  expect(await months.count()).toBeGreaterThan(3)
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(scrolls).toBe(false)
  // The chart reads one month at a time on tap.
  const chart = page.getByRole('group', { name: 'Money in and out, month by month' })
  await chart.getByRole('button').last().click()
  await expect(chart.getByText('In', { exact: true })).toBeVisible()
  // Life goals from the sample household, one linked to the holiday fund.
  await page.getByRole('link', { name: 'More' }).first().click()
  await page
    .getByRole('main')
    .getByRole('link', { name: /^Goals/ })
    .click()
  const goals = page.getByRole('region', { name: 'Life goals' })
  await expect(goals.getByRole('heading', { name: 'Two weeks by the sea' })).toBeVisible()
  await expect(goals.getByRole('progressbar', { name: 'Summer holiday progress' })).toBeVisible()
  await page.goto('/review')
  await page.getByRole('radio', { name: 'Per payday' }).click()
  await expect(page.getByText(/You carried .+ into this payday\./)).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})
