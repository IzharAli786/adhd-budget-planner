import { useCallback } from 'react'
import { undoLast } from '../db/undo'
import { useToast } from '../ui/Toast'

/**
 * "Marked paid · Undo". Every repo write is one undo step (db/undo.ts), so the toast just
 * reverts the latest one. 10 s matches the delete/undo rule in PLAN §8.
 */
export function useUndoToast() {
  const toast = useToast()
  return useCallback(
    (message: string) =>
      toast.show({
        message,
        duration: 10_000,
        action: { label: 'Undo', onAction: () => void undoLast() },
      }),
    [toast],
  )
}
