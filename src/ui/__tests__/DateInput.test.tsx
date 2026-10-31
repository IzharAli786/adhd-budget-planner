// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { DateInput } from '../DateInput'

afterEach(cleanup)

const format = (d: string) => `formatted ${d}`

it.each([
  { value: '2026-11-07', hint: undefined, error: undefined, want: 'formatted 2026-11-07' },
  // A hint or an error says something more useful than the preview.
  { value: '2026-11-07', hint: 'A hint', error: undefined, want: 'A hint' },
  { value: '', hint: undefined, error: undefined, want: null },
])('preview for %j', ({ value, hint, error, want }) => {
  render(
    <DateInput
      label="Due on"
      value={value}
      onChange={() => {}}
      hint={hint}
      error={error}
      format={format}
    />,
  )
  const input = screen.getByLabelText('Due on')
  const id = input.getAttribute('aria-describedby')
  expect(id ? document.getElementById(id)?.textContent : null).toBe(want)
})
