// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../../app/App'
import * as r from '../../../db/repos'
import { resetDb, seedReadyInstall } from '../../../db/__tests__/helpers'
import { makeFormatters } from '../../bills/format'

// Sat 31 Oct 2026, noon local.
const NOW = new Date(2026, 9, 31, 12, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await resetDb()
  await seedReadyInstall()
  localStorage.clear()
  window.history.replaceState(null, '', '/more/settings')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const preview = () => (screen.getByText(/week starts/).textContent ?? '').replace('Preview: ', '')

describe('Settings: region & format', () => {
  it('previews locale, currency, week start and date style live', async () => {
    render(<App />)
    await screen.findByText('Region & format')
    const day = makeFormatters('en-IE', 'EUR', 2).day('2026-10-31') // "Sat, 31 Oct" in ICU 7x
    await waitFor(() => expect(preview()).toBe(`${day} · €1,234.56 · week starts Monday`))

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Number and date format' }),
      'de-DE',
    )
    await waitFor(() => expect(preview()).toContain('1.234,56'))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Week starts on' }), '0')
    await waitFor(() => expect(preview()).toContain('week starts Sunday'))

    await userEvent.click(screen.getByRole('radio', { name: /^Numbers/ }))
    await waitFor(() => expect(preview()).toMatch(/^Sa\., 31\.10\./))
    expect(await r.getSettings()).toMatchObject({
      locale: 'de-DE',
      weekStart: 0,
      dateStyle: 'numbers',
    })
  })

  it('only offers currencies that keep stored amounts meaning the same', async () => {
    render(<App />)
    const currency = await screen.findByRole('combobox', { name: 'Currency' })
    const codes = [...currency.querySelectorAll('option')].map((o) => o.value)
    expect(codes).toContain('GBP')
    expect(codes).not.toContain('JPY')
    await userEvent.selectOptions(currency, 'GBP')
    await waitFor(() => expect(preview()).toContain('£1,234.56'))
  })
})

describe('formatters', () => {
  it('date style: words or the locale’s numeric order', () => {
    expect(makeFormatters('en-IE', 'EUR', 2, 'words').day('2026-11-07')).toMatch(/^Sat,? 7 Nov$/)
    expect(makeFormatters('en-IE', 'EUR', 2, 'numbers').day('2026-11-07')).toMatch(/07\/11$/)
    expect(makeFormatters('en-US', 'USD', 2, 'numbers').day('2026-11-07')).toMatch(/11\/07$/)
    expect(makeFormatters('de-DE', 'EUR', 2, 'numbers').day('2026-11-07')).toMatch(/07\.11\.$/)
  })

  it('percent follows the locale', () => {
    expect(makeFormatters('en-IE', 'EUR', 2).percent(0.219)).toBe('21.9%')
    expect(makeFormatters('de-DE', 'EUR', 2).percent(0.219)).toBe('21,9 %')
  })
})
