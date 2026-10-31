// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SaveBackupButton } from '../SaveBackup'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const file = (name: string) => new File(['{}'], name, { type: 'application/json' })

describe('SaveBackupButton download link', () => {
  // Tapping the link records the backup, which re-prepares the file: the old URL must
  // outlive that, or Safari can cancel the download it just started.
  it('keeps the old blob URL alive for a while after the file is replaced', () => {
    vi.useFakeTimers()
    let n = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test/${++n}`)
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const { rerender } = render(<SaveBackupButton file={file('a.json')} />)
    expect(screen.getByRole('link', { name: 'Save backup' }).getAttribute('href')).toBe(
      'blob:test/1',
    )
    rerender(<SaveBackupButton file={file('b.json')} />)
    expect(screen.getByRole('link', { name: 'Save backup' }).getAttribute('href')).toBe(
      'blob:test/2',
    )

    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(10_000)
    expect(revoke).toHaveBeenCalledWith('blob:test/1')
  })
})
