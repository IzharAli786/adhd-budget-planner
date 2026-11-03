// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '../../db/__tests__/helpers'
import { getMeta } from '../../db/repos'
import { UpdateReady } from '../UpdateToast'

beforeEach(resetDb)
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('update toast (R0)', () => {
  it('"Back up first" saves a backup, then refreshes', async () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:test/1')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const onRefresh = vi.fn()
    render(<UpdateReady onLater={() => {}} onRefresh={onRefresh} />)

    // No share sheet in happy-dom, so the button is a download link once the file is ready.
    const link = await screen.findByRole('link', { name: 'Back up first' })
    link.addEventListener('click', (e) => e.preventDefault())
    await userEvent.click(link)

    await waitFor(() => expect(getMeta('lastBackupAt')).resolves.toBeTypeOf('string'))
    expect(onRefresh).not.toHaveBeenCalled() // the download gets a moment to start
    await waitFor(() => expect(onRefresh).toHaveBeenCalledOnce(), { timeout: 3000 })
  })

  it('"Refresh now" and "Later" do what they say', async () => {
    const onRefresh = vi.fn()
    const onLater = vi.fn()
    render(<UpdateReady onLater={onLater} onRefresh={onRefresh} />)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh now' }))
    await userEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(onRefresh).toHaveBeenCalledOnce()
    expect(onLater).toHaveBeenCalledOnce()
  })
})
