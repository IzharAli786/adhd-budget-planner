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
  const [atTop, setAtTop] = useState(false)
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    // One at a time: stacked toasts pile up over the tab bar and nobody reads them.
    setToasts([{ duration: 5000, ...options, id }])
    setAtTop(coversFocusedField())
    return id
  }, [])

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Phones: above the tab bar AND the floating + (5.25rem + 3.5rem), so a toast never
          sits on a control. Desktop: bottom centre, clear of the + in the corner. */}
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 md:pl-28 lg:pl-60',
          atTop
            ? // Below the demo's sticky banner when there is one.
              'top-[calc(var(--demo-banner-h,0px)+max(env(safe-area-inset-top),1rem))]'
            : 'bottom-[calc(9.5rem+env(safe-area-inset-bottom))] md:bottom-6',
        )}
      >
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * True when the focused text field (Today's quick-add, still focused after Enter) sits
 * where the toast would appear: the toast then shows at the top instead of covering
 * the next thing the person types.
 */
export function coversFocusedField(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
  // A field in a modal: the save that shows the toast also closes the dialog, so the
  // field is gone by the time anyone reads the toast. Moving up then just looks random.
  if (el.closest('dialog')) return false
  // An on-screen keyboard is open (the visual viewport shrank): a bottom toast, Undo
  // included, would sit behind it.
  const vv = window.visualViewport
  if (vv && vv.height < window.innerHeight - 150) return true
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  // The bottom offsets used below, and about 4.5rem for one toast above that edge.
  const wide = window.matchMedia?.('(min-width: 48rem)').matches ?? false
  const bottom = window.innerHeight - (wide ? 1.5 : 9.5) * rem
  const field = el.getBoundingClientRect()
  return field.bottom > bottom - 4.5 * rem && field.top < bottom
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
