// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { FundYear } from '../../../domain/yearSummary'
import { makeFormatters } from '../../bills/format'
import { SavingsYearCard } from '../YearCards'

const f = makeFormatters('en-IE', 'EUR', 2)
const fund = (id: string, savedInRange: number, savedTotal: number): FundYear => ({
  id,
  name: id,
  savedInRange,
  savedTotal,
  target: 100000,
  ofTarget: savedTotal / 100000,
})

afterEach(cleanup)

describe('SavingsYearCard', () => {
  it('shows a withdrawal in calm words, never "+−"', async () => {
    render(
      <SavingsYearCard
        funds={[fund('Holiday', 4000, 40000), fund('Car repairs', -5000, 10000)]}
        f={f}
        title="Savings this year"
        when="this year"
      />,
    )
    const card = screen.getByRole('region', { name: 'Savings this year' })
    expect(card.textContent).not.toMatch(/\+\s*[−-]/)
    expect(within(card).getAllByText('+€40.00').length).toBeGreaterThan(0)
    expect(within(card).getAllByText('€50.00 taken out').length).toBeGreaterThan(0)
    // Net €10 out over the year: said as such, not "−€10.00 moved into your funds".
    expect(
      within(card).getByText('€10.00 more taken out of your funds than put in this year.'),
    ).toBeTruthy()

    await userEvent.click(within(card).getByRole('button', { name: 'Show as a table' }))
    const row = within(within(card).getByRole('table')).getByRole('row', { name: /Car repairs/ })
    expect(within(row).getByText('€50.00 taken out')).toBeTruthy()
  })
})
