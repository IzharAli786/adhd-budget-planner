// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsProvider } from '../../../app/SettingsProvider'
import { resetDb } from '../../../db/__tests__/helpers'
import type { Bill, Envelope } from '../../../domain/types'
import { BillForm, validateBill } from '../BillForm'

afterEach(cleanup)
beforeEach(resetDb)

const wrap = (ui: ReactNode) => render(<SettingsProvider>{ui}</SettingsProvider>)

function renderForm(bill?: Bill, envelopes?: Envelope[]) {
  const onSubmit = vi.fn()
  wrap(
    <>
      <BillForm
        id="f"
        bill={bill}
        envelopes={envelopes}
        defaultDate="2026-11-05"
        today="2026-10-31"
        onSubmit={onSubmit}
      />
      <button type="submit" form="f">
        Save
      </button>
    </>,
  )
  return onSubmit
}

describe('validateBill', () => {
  it.each([
    [{ name: '', amount: 100, start: '2026-11-01' }, ['name']],
    [{ name: '  ', amount: 100, start: '2026-11-01' }, ['name']],
    [{ name: 'Rent', amount: null, start: '2026-11-01' }, ['amount']],
    [{ name: 'Rent', amount: 0, start: '2026-11-01' }, ['amount']],
    [{ name: 'Rent', amount: 100, start: '' }, ['start']],
    [{ name: 'Rent', amount: 100, start: '2026-02-30' }, ['start']],
    [{ name: 'Rent', amount: 100, start: '2026-11-01' }, []],
  ])('%j -> %j', (input, fields) => {
    expect(Object.keys(validateBill(input)).sort()).toEqual(fields)
  })
})

describe('BillForm', () => {
  it('shows nothing scary before the first save, then every problem at once', async () => {
    const onSubmit = renderForm()
    expect(screen.queryByText(/Give it a name/)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/Give it a name/)).toBeTruthy()
    expect(screen.getByText(/How much is it/)).toBeTruthy()
    expect(onSubmit).not.toHaveBeenCalled()
    // Focus lands on the first broken field.
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Name' }))
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true')
  })

  it('submits a monthly bill on the chosen date by default', async () => {
    const onSubmit = renderForm()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), '  Rent ')
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount' }), '950,50')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Rent',
      amount: 95050,
      autopay: false,
      rule: { freq: 'monthly', interval: 1, day: 5, anchor: '2026-11-05' },
    })
  })

  it('links a bill to an envelope when envelopes are shown, and leaves it alone otherwise', async () => {
    const food: Envelope = {
      id: 'food',
      name: 'Food',
      budget: 30000,
      isDefault: false,
      color: 'accent',
      sort: 1,
    }
    const onSubmit = renderForm(undefined, [food])
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Veg box')
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount' }), '40')
    await userEvent.click(screen.getByRole('button', { name: 'Food' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ envelopeId: 'food' })
    cleanup()

    // Picker hidden (envelopes off / Simple mode): the change carries no envelope key, so
    // an existing link survives the edit.
    const again = renderForm()
    expect(screen.queryByText('Comes out of an envelope?')).toBeNull()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Rent')
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount' }), '900')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect('envelopeId' in again.mock.calls[0]![0]).toBe(false)
  })

  it('every 2 weeks with autopay', async () => {
    const onSubmit = renderForm()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Gym')
    await userEvent.type(screen.getByRole('textbox', { name: 'Amount' }), '30')
    await userEvent.click(screen.getByRole('radio', { name: 'Every 2 weeks' }))
    await userEvent.click(screen.getByRole('switch', { name: 'Paid automatically' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      autopay: true,
      rule: { freq: 'weekly', interval: 2, anchor: '2026-11-05' },
    })
  })

  it('editing leaves a rule it cannot show exactly alone unless repeat fields change', async () => {
    const bill: Bill = {
      id: 'b',
      name: 'Rent',
      amount: 1000,
      // Every 3 weeks: the form has no such choice.
      rule: { freq: 'weekly', interval: 3, anchor: '2026-11-06' },
      autopay: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const onSubmit = renderForm(bill)
    await waitFor(() =>
      expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe(
        'Rent',
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ rule: null, amount: 1000 })
  })
})
