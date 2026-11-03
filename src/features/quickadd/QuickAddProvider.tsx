import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { useLocation } from 'react-router'
import { useUndoToast } from '../../app/useUndoToast'
import { useCheckIns, useEnvelopes } from '../../db/hooks'
import { useAppSettings } from '../../app/SettingsProvider'
import { addTransaction } from '../../db/repos'
import { askIfInBalance } from '../../domain/reconcile'
import type { Cents, Id, ISODate } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Dialog } from '../../ui/Dialog'
import { Icon } from '../../ui/Icon'
import { useFormat } from '../bills/format'
import { QuickAddSheet } from './QuickAddSheet'

export interface NewEntry {
  /** Signed: spending is negative. */
  amount: Cents
  note: string
  date: ISODate
  envelopeId?: Id
}

interface QuickAddApi {
  /** Saves with an undo toast. Resolves false if the user backed out of the question. */
  save: (entry: NewEntry) => Promise<boolean>
  openSheet: () => void
  /** Today's inline field registers here so `n` focuses it instead of opening the sheet. */
  fieldRef: RefObject<HTMLInputElement | null>
}

const QuickAddContext = createContext<QuickAddApi | null>(null)

type Pending = { entry: NewEntry; resolve: (inBalance: boolean | null) => void }

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/**
 * One place that logs money, used by Today's field, the sheet and the one-tap chips, so
 * they all ask the same backdating question and show the same undo toast.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const checkIns = useCheckIns()
  const checkIn = checkIns?.at(-1)
  const envelopes = useEnvelopes()
  const { settings } = useAppSettings()
  const showEnvelopes = settings.envelopesEnabled && !settings.simpleMode
  // Spending inside an envelope's budget uses room already held back, so "until payday"
  // doesn't move. Naming the budget in the toast says why. Untagged spending uses the
  // default envelope (Everyday), as safe-to-spend counts it.
  const budgetOf = useCallback(
    (entry: NewEntry) => {
      if (!showEnvelopes || entry.amount >= 0 || !envelopes) return null
      const live = envelopes.filter((e) => e.deletedAt === undefined)
      const env =
        live.find((e) => e.id === entry.envelopeId) ?? live.find((e) => e.isDefault) ?? null
      return env && env.budget > 0 ? env.name : null
    },
    [showEnvelopes, envelopes],
  )
  const { pathname } = useLocation()
  const onToday = pathname === '/'
  const [sheetOpen, setSheetOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const fieldRef = useRef<HTMLInputElement | null>(null)

  const save = useCallback(
    async (entry: NewEntry) => {
      let inBalance = false
      // A backdated entry may already be in the balance the user typed (PLAN §4.1).
      if (askIfInBalance(entry.date, checkIn)) {
        const answer = await new Promise<boolean | null>((resolve) =>
          setPending({ entry, resolve }),
        )
        setPending(null)
        if (answer === null) return false
        inBalance = answer
      }
      await addTransaction({
        date: entry.date,
        amount: entry.amount,
        note: entry.note.trim(),
        ...(entry.envelopeId ? { envelopeId: entry.envelopeId } : {}),
        ...(inBalance ? { inBalance: true } : {}),
      })
      const what = entry.note.trim() ? ` · ${entry.note.trim()}` : ''
      const from = budgetOf(entry)
      undoToast(
        `${entry.amount < 0 ? 'Logged' : 'Added'} ${f.money(Math.abs(entry.amount))}${what}${from ? ` · from ${from} budget` : ''}`,
      )
      return true
    },
    [checkIn, f, undoToast, budgetOf],
  )

  const openSheet = useCallback(() => setSheetOpen(true), [])

  // `n` for "new" (PLAN §5), never while typing or with a dialog already open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      if (onToday && fieldRef.current) fieldRef.current.focus()
      else setSheetOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onToday])

  const api = useMemo(() => ({ save, openSheet, fieldRef }), [save, openSheet])

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      {/* On every screen, Today included: Today no longer has its own field. */}
      {(
        <button
          type="button"
          onClick={openSheet}
          aria-label="Track spending"
          aria-keyshortcuts="n"
          title="Track spending (n)"
          className={cx(
            'print-hide fixed right-5 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center gap-2 rounded-full',
            'bg-accent text-accent-contrast shadow-card transition-[filter,transform] hover:brightness-105 active:scale-95',
            // From md up it lives in the side rail, outside the content column, so it can
            // never sit on a card. Above the rail (z-40), below toasts and dialogs.
            'md:right-auto md:bottom-6 md:left-5 md:z-[45]',
            'lg:left-6 lg:w-44 lg:justify-start lg:rounded-2xl lg:px-4',
          )}
        >
          <Icon name="plus" size={26} strokeWidth={2.2} />
          <span aria-hidden="true" className="hidden font-medium lg:inline">
            Track spending
          </span>
        </button>
      )}
      <QuickAddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <Dialog
        open={pending !== null}
        onClose={() => pending?.resolve(null)}
        title="Is this already in your bank balance?"
        description={
          pending &&
          `It’s dated ${f.dayLong(pending.entry.date)}, before your last balance update. If your bank already shows it, Steady won’t take it off again.`
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => pending?.resolve(false)}>
              No, not yet
            </Button>
            <Button onClick={() => pending?.resolve(true)}>Yes, it’s in there</Button>
          </>
        }
      />
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd(): QuickAddApi {
  const ctx = useContext(QuickAddContext)
  if (!ctx) throw new Error('useQuickAdd must be used inside <QuickAddProvider>')
  return ctx
}
