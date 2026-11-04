import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { ensureFullMode, logExpense, unlockAndSetup } from './helpers'

test('common categories, an @tag chip, the log filter and a CSV export', async ({
  page,
}, testInfo) => {
  // As in backup.spec: without canShare the app offers its plain download link.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined })
  })
  await unlockAndSetup(page)
  await ensureFullMode(page)

  await page.goto('/envelopes')
  // Envelopes are on from setup, with Everyday ready: the starter offer is right there.
  await page.getByRole('button', { name: 'Start with common categories' }).click()
  await expect(page.getByRole('heading', { name: 'Eating out' })).toBeVisible()

  await page.goto('/')
  await logExpense(page, '12 lunch @eating')
  // A note that a spreadsheet would run as a formula: the CSV must neutralise it.
  await logExpense(page, '3 =1+2 bus')

  await page.goto('/more/transactions')
  const totals = page.getByRole('region', { name: 'Totals' })
  await expect(totals).toContainText('2 of 2 entries')
  // The months row starts at January; on a phone the latest month must still be in view.
  const months = page.getByRole('group', { name: /^Months in/ })
  await expect(months.getByRole('button').last()).toBeInViewport({ ratio: 1 })
  await page
    .getByRole('group', { name: 'Envelope' })
    .getByRole('button', { name: 'Eating out' })
    .click()
  await expect(totals).toContainText('1 of 2 entries')
  await expect(page.getByRole('button', { name: /lunch/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /bus/ })).toHaveCount(0)

  // Back to everything this period, then export it.
  await page
    .getByRole('group', { name: 'Envelope' })
    .getByRole('button', { name: 'Eating out' })
    .click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    totals.getByRole('link', { name: 'Export for spreadsheets (CSV)' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^steady-transactions-.*\.csv$/)
  const file = testInfo.outputPath(download.suggestedFilename())
  await download.saveAs(file)
  const text = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '')
  const rows = text.trimEnd().split('\r\n')
  expect(rows[0]).toBe('Date,Amount,Currency,Type,Envelope,Note')
  expect(rows).toHaveLength(3)
  expect(text).toMatch(/,-12\.00,[A-Z]{3},Spent,Eating out,lunch\r\n/)
  // A note that looks like a formula stays text in a spreadsheet.
  expect(text).toContain(",'=1+2 bus")
})
