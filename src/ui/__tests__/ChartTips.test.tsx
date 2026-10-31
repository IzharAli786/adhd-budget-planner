// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { makeFormatters } from '../../features/bills/format'
import InsightsCharts from '../../features/review/InsightsCharts'
import { ChartTips } from '../ChartTips'

afterEach(cleanup)

const columns = [
  { key: 'a', title: 'September 2026', at: 0.25, lines: [{ label: 'In', value: '€10.00' }] },
  { key: 'b', title: 'October 2026', at: 0.75, lines: [{ label: 'In', value: '€20.00' }] },
]

describe('ChartTips', () => {
  it('a tapped tip closes when the next tap lands outside the chart (iOS never blurs)', () => {
    render(
      <>
        <p>Outside</p>
        <div style={{ position: 'relative' }}>
          <ChartTips columns={columns} label="Money per month" />
        </div>
      </>,
    )
    const group = screen.getByRole('group', { name: 'Money per month' })
    // fireEvent.click does not move focus, like a tap in iOS Safari.
    fireEvent.click(within(group).getByRole('button', { name: 'October 2026: In €20.00' }))
    expect(within(group).getByText('October 2026')).toBeTruthy()
    // A tap on another column inside the chart moves the tip, it does not close it.
    const september = within(group).getByRole('button', { name: 'September 2026: In €10.00' })
    fireEvent.pointerDown(september)
    fireEvent.click(september)
    expect(within(group).getByText('September 2026')).toBeTruthy()
    fireEvent.pointerDown(screen.getByText('Outside'))
    expect(within(group).queryByText('September 2026')).toBeNull()
  })

  it('is one Tab stop; arrows move the tip and Tab leaves the chart', async () => {
    render(
      <>
        <ChartTips columns={columns} label="Money per month" />
        <button type="button">After</button>
      </>,
    )
    const group = screen.getByRole('group', { name: 'Money per month' })
    await userEvent.tab()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('October 2026: In €20.00')
    expect(within(group).getByText('October 2026')).toBeTruthy()
    await userEvent.keyboard('{ArrowLeft}')
    expect(within(group).getByText('September 2026')).toBeTruthy()
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'After' }))
    expect(within(group).queryByText('September 2026')).toBeNull()
  })
})

describe('Insights bars', () => {
  const f = makeFormatters('en-IE', 'EUR', 2)
  const rows = [
    { key: 'food', name: 'Groceries', planned: 20000, actual: 8400, color: 'red' },
    { key: 'fun', name: 'Fun', planned: 4000, actual: 1150, color: 'blue' },
  ]
  const tipOf = (name: string) =>
    document
      .querySelector(`li [aria-hidden="true"].pointer-events-none`)
      ?.textContent?.includes(name) ?? false

  it('keyboard focus shows a bar’s tip, without a toggle state that has nothing to expand', async () => {
    render(<InsightsCharts rows={rows} f={f} caption="Spending" />)
    const bar = screen.getByRole('button', { name: /^Groceries: actual €84\.00/ })
    expect(bar.hasAttribute('aria-expanded')).toBe(false)
    bar.focus()
    await userEvent.tab({ shift: true })
    await userEvent.tab()
    expect(document.activeElement).toBe(bar)
    expect(tipOf('Groceries')).toBe(true)
  })

  it('a tapped bar’s tip closes on a tap elsewhere', () => {
    render(
      <>
        <p>Outside</p>
        <InsightsCharts rows={rows} f={f} caption="Spending" />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Fun: actual/ }))
    expect(tipOf('Fun')).toBe(true)
    fireEvent.pointerDown(screen.getByText('Outside'))
    expect(tipOf('Fun')).toBe(false)
  })
})
