import { expect, test } from '@playwright/test'
import { hero, heroCents, logExpense, unlockAndSetup } from './helpers'

test('unlock, four setup steps, a number in under 60 s, then "12 coffee"', async ({ page }) => {
  const started = Date.now()
  await unlockAndSetup(page)
  // PLAN §10 M6: a number in under 60 s after unlock. Scripted it takes seconds; the
  // budget catches a step that suddenly blocks or spins.
  expect(Date.now() - started).toBeLessThan(60_000)
  await expect(page.getByText('You can spend today')).toBeVisible()

  // PLAN §10 M5: "12 coffee" logs €12.00 and leftToday drops by exactly €12.
  const before = await logExpense(page, '12 coffee')
  await expect.poll(() => heroCents(page)).toBe(before - 1200)
  // The currency follows the browser's locale, so match the amount, not the symbol.
  await expect(page.getByRole('button', { name: /^Log coffee \D*12\.00\D* again$/ })).toBeVisible()
})

test('a wrong code is rejected kindly', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Unlock code').fill('STEADY-AAAA-BBBB-CCCC-DDDD')
  await page.getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByText(/didn’t match/)).toBeVisible()
  await expect(hero(page)).toHaveCount(0)
})
