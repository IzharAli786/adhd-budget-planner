// A card that folds away. Secondary sections on long screens (Plan's Insights, the payday
// note, "Can this fit?") start folded on a phone so the page stays short; whatever the
// person picks is remembered per section on this device.
import { useCallback, useId, useState, type ReactNode } from 'react'
import { cx } from './cx'
import { Icon } from './Icon'

const KEY = 'steady:open-sections'

function readAll(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function remember(id: string, open: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: open }))
  } catch {
    // Private mode or storage blocked: it folds the same way, just not remembered.
  }
}

/** Phones start folded; wider screens have the room to start open. */
const startsOpen = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    ? true
    : !window.matchMedia('(max-width: 39.99rem)').matches

/**
 * Open state for a foldable section, remembered under `id`. Without an id the section
 * is simply always open, so a component can be foldable in one place and not another.
 */
export function useDisclosure(id: string | undefined): [boolean, () => void] {
  const [open, setOpen] = useState(() => (id ? (readAll()[id] ?? startsOpen()) : true))
  const toggle = useCallback(() => {
    if (!id) return
    setOpen((o) => {
      remember(id, !o)
      return !o
    })
  }, [id])
  return [open, toggle]
}

/** The heading's button: the title and a chevron that turns as it opens. */
export function DisclosureButton({
  open,
  onToggle,
  controls,
  children,
  className,
}: {
  open: boolean
  onToggle: () => void
  controls: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cx(
        // The focus ring is app.css's global one (it outranks any ring utility here).
        'flex min-h-11 w-full items-center gap-2 rounded-xl text-left',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <Icon
        name="down"
        size={20}
        className={cx(
          'shrink-0 text-muted transition-transform motion-reduce:transition-none',
          open && 'rotate-180',
        )}
      />
    </button>
  )
}

interface Props {
  /** Storage key: one remembered choice per section. */
  id: string
  title: string
  /** One quiet line under the title while folded: what is inside. */
  summary?: ReactNode
  children: ReactNode
  className?: string
}

/** A card section whose body folds away behind its heading. */
export function Disclosure({ id, title, summary, children, className }: Props) {
  const [open, toggle] = useDisclosure(id)
  const headingId = useId()
  const panelId = useId()
  return (
    <section aria-labelledby={headingId} className={cx('card p-5 sm:p-6', className)}>
      <h2 id={headingId} className="-my-1.5 text-heading">
        <DisclosureButton open={open} onToggle={toggle} controls={panelId}>
          {title}
        </DisclosureButton>
      </h2>
      {!open && summary && <div className="mt-1 text-body text-muted">{summary}</div>}
      <div id={panelId} hidden={!open}>
        {open && children}
      </div>
    </section>
  )
}
