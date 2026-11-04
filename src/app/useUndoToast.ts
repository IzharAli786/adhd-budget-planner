import { useCallback } from 'react'
import { undoLast } from '../db/undo'
import { useToast } from '../ui/Toast'

export interface UndoToastOptions {
  /** 'success' for a confirmation (marked paid, done, ticked); neutral by default. */
  tone?: 'neutral' | 'success'
}

/**
 * "Marked paid · Undo". Every repo write is one undo step (db/undo.ts), so the toast just
 * reverts the latest one. 10 s matches the delete/undo rule in PLAN §8.
 */
export function useUndoToast(): (message: string, options?: UndoToastOptions) => number {
  const toast = useToast()
  return useCallback(
    (message: string, options?: UndoToastOptions) =>
      toast.show({
        message,
        tone: options?.tone,
        duration: 10_000,
        action: { label: 'Undo', onAction: () => void undoLast() },
      }),
    [toast],
  )
}
