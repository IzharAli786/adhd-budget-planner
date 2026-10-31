import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export interface ToastOptions {
  message: ReactNode
  /** e.g. { label: 'Undo', onAction: undoLast } */
  action?: { label: string; onAction: () => void }
  /** ms; 0 keeps it until dismissed. Undo toasts use 10 s (PLAN §8). */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastApi {
  show: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    // One at a time: stacked toasts pile up over the tab bar and nobody reads them.
    setToasts([{ duration: 5000, ...options, id }])
    return id
  }, [])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast.duration) return
    const timer = setTimeout(onDismiss, toast.duration)
    return () => clearTimeout(timer)
  }, [toast.duration, onDismiss])

  return (
    <div
      className={cx(
        'animate-toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl',
        'bg-text py-2 pr-2 pl-4 text-bg shadow-card',
      )}
    >
      <p className="min-w-0 flex-1 py-2 text-body">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.onAction()
            onDismiss()
          }}
          className="min-h-11 shrink-0 rounded-xl px-4 font-semibold underline-offset-4 hover:underline"
        >
          {toast.action.label}
        </button>
      )}
      {!toast.action && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl opacity-70 hover:opacity-100"
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
