import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Buttons row, rendered at the bottom. */
  actions?: ReactNode
  className?: string
  /** Extra class for the <dialog> element itself (Sheet uses this). */
  variant?: 'center' | 'sheet'
}

/**
 * Native <dialog> + showModal() gives a focus trap, Esc to close, an inert background
 * and the top layer for free (PLAN §8). We add: a labelled title, a backdrop click to
 * close, and focus returning to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  className,
  variant = 'center',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    const opener = document.activeElement as HTMLElement | null
    if (!dialog.open) {
      // happy-dom and very old Safari lack showModal; open non-modally there.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    return () => {
      if (dialog.open) dialog.close()
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Esc fires 'cancel'; we route it through onClose so React state stays the truth.
      onCancel={(e) => {
        e.preventDefault()
        onCloseRef.current()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
      className={cx(
        'm-auto max-h-[min(90dvh,48rem)] w-[min(100%-2rem,28rem)] overflow-visible bg-transparent p-0 text-text',
        variant === 'sheet' &&
          'sheet mb-0 w-full max-w-none md:mb-auto md:w-[min(100%-2rem,32rem)]',
      )}
    >
      <div
        className={cx(
          'flex max-h-[inherit] flex-col overflow-hidden bg-surface shadow-card ring-1 ring-line',
          variant === 'sheet'
            ? 'rounded-t-[1.75rem] pb-[env(safe-area-inset-bottom)] md:rounded-[1.75rem] md:pb-0'
            : 'rounded-[1.75rem]',
          className,
        )}
      >
        {variant === 'sheet' && (
          <div
            aria-hidden="true"
            className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line md:hidden"
          />
        )}
        <header className="flex items-start gap-3 px-6 pt-5">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="text-lg leading-snug font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-[0.9375rem] text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-muted hover:bg-accent-soft/60"
            aria-label="Close"
          >
            <Icon name="close" size={20} />
          </button>
        </header>
        {children && <div className="overflow-y-auto px-6 pt-4 pb-2">{children}</div>}
        {actions && (
          <div className="flex flex-col-reverse gap-2 px-6 pt-3 pb-6 sm:flex-row sm:justify-end">
            {actions}
          </div>
        )}
        {!actions && <div className="h-4" />}
      </div>
    </dialog>
  )
}
