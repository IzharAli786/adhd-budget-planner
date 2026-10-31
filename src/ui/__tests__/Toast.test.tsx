// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { coversFocusedField, ToastProvider, useToast } from '../Toast'

// A 390 x 844 phone at 16px: the bottom toast's lower edge is 844 - 9.5rem = 692.
function field(top: number, height = 48, inDialog = false) {
  const input = document.createElement('input')
  input.getBoundingClientRect = () => ({ top, bottom: top + height }) as DOMRect
  const host = inDialog ? document.createElement('dialog') : document.createElement('div')
  host.append(input)
  document.body.append(host)
  input.focus()
  return input
}

beforeEach(() => {
  vi.stubGlobal('innerHeight', 844)
  vi.stubGlobal('visualViewport', { height: 844 })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('coversFocusedField', () => {
  it.each([
    { name: 'field where the toast lands', top: 640, inDialog: false, want: true },
    { name: 'field near the top', top: 120, inDialog: false, want: false },
    // The dialog closes on the same save that shows the toast.
    { name: 'field in a dialog', top: 640, inDialog: true, want: false },
  ])('$name -> $want', ({ top, inDialog, want }) => {
    field(top, 48, inDialog)
    expect(coversFocusedField()).toBe(want)
  })

  it('nothing focused: stays at the bottom', () => {
    expect(coversFocusedField()).toBe(false)
  })

  it('on-screen keyboard open: moves up, or Undo would hide behind the keyboard', () => {
    vi.stubGlobal('visualViewport', { height: 500 })
    field(120)
    expect(coversFocusedField()).toBe(true)
  })
})

function Shower() {
  const toast = useToast()
  return <button onClick={() => toast.show({ message: 'Saved' })}>Show</button>
}

it('the region moves to the top when the focused field would be covered', () => {
  render(
    <ToastProvider>
      <Shower />
    </ToastProvider>,
  )
  const region = screen.getByRole('status')
  fireEvent.click(screen.getByText('Show'))
  expect(region.className).toMatch(/bottom-/)
  field(640)
  fireEvent.click(screen.getByText('Show'))
  expect(region.className).toMatch(/top-/)
  expect(region.className).not.toMatch(/bottom-/)
})
