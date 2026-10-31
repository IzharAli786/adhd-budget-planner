// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '../Dialog'

afterEach(cleanup)

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Open it</button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.()
          setOpen(false)
        }}
        title="Restore this backup?"
        description="Everything will be replaced."
      >
        <input aria-label="Inside" />
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is labelled by its title and described by its description', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Open it'))
    const dialog = screen.getByRole('dialog', { hidden: true })
    const title = document.getElementById(dialog.getAttribute('aria-labelledby')!)
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!)
    expect(title?.textContent).toBe('Restore this backup?')
    expect(desc?.textContent).toBe('Everything will be replaced.')
    expect((dialog as HTMLDialogElement).open).toBe(true)
  })

  it.each([
    [
      'Esc (the cancel event)',
      (d: HTMLElement) => fireEvent(d, new Event('cancel', { cancelable: true })),
    ],
    [
      'the Close button',
      () => fireEvent.click(screen.getByRole('button', { name: 'Close', hidden: true })),
    ],
    ['a click on the backdrop', (d: HTMLElement) => fireEvent.click(d)],
  ])('closes on %s and returns focus to the opener', (_, close) => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByText('Open it')
    opener.focus()
    fireEvent.click(opener)
    const dialog = screen.getByRole('dialog', { hidden: true })

    close(dialog)

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('does not close when clicking inside the panel', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByText('Open it'))
    fireEvent.click(screen.getByLabelText('Inside'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
