import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { useEnvelopes } from '../../db/hooks'
import { useAppSettings } from '../../app/SettingsProvider'
import { addTransaction } from '../../db/repos'
import type { Cents, Id, ISODate } from '../../domain/types'
import { cx } from '../../ui/cx'
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
}

const QuickAddContext = createContext<QuickAddApi | null>(null)

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/**
 * One place that logs money, used by the "Track spending" sheet and its one-tap chips, so
 * they all save the same way and show the same undo toast.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const f = useFormat()
  const undoToast = useUndoToast()
  const envelopes = useEnvelopes()
  const { settings } = useAppSettings()
  const showEnvelopes = settings.envelopesEnabled && !settings.simpleMode
  // The toast names the budget the spending came out of. Untagged spending uses the default
  // envelope (Everyday), the same as the envelope totals count it.
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
  const [sheetOpen, setSheetOpen] = useState(false)

  const save = useCallback(
    async (entry: NewEntry) => {
      // No "is this already in your bank balance?" question any more: safe to spend is
      // built from income, bills and spending, not a bank balance, so the answer changed
      // nothing. Entries dated before tracking started are left out by date instead.
      await addTransaction({
        date: entry.date,
        amount: entry.amount,
        note: entry.note.trim(),
        ...(entry.envelopeId ? { envelopeId: entry.envelopeId } : {}),
      })
      const what = entry.note.trim() ? ` · ${entry.note.trim()}` : ''
      const from = budgetOf(entry)
      undoToast(
        `${entry.amount < 0 ? 'Logged' : 'Added'} ${f.money(Math.abs(entry.amount))}${what}${from ? ` · from ${from} budget` : ''}`,
      )
      return true
    },
    [f, undoToast, budgetOf],
  )

  const openSheet = useCallback(() => setSheetOpen(true), [])

  // `n` for "new" (PLAN §5), never while typing or with a dialog already open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return
      e.preventDefault()
      setSheetOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const api = useMemo(() => ({ save, openSheet }), [save, openSheet])

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      {/* On every screen, Today included: Today no longer has its own field. */}
      {
        <button
          type="button"
          onClick={openSheet}
          aria-label="Track spending"
          aria-keyshortcuts="n"
          title="Track spending (n)"
          className={cx(
            'print-hide fixed right-5 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full',
            'bg-accent text-accent-contrast shadow-card transition-[filter,transform] hover:brightness-105 active:scale-95',
            // From md up it lives in the side rail, outside the content column, so it can
            // never sit on a card. Above the rail (z-40), below toasts and dialogs.
            'md:right-auto md:bottom-6 md:left-5 md:z-[45]',
            'lg:left-6 lg:h-13 lg:w-48 lg:justify-start lg:gap-2.5 lg:px-5 lg:whitespace-nowrap',
          )}
        >
          {/* 22 on its own; 20 beside the label, where the label carries the weight. */}
          <Icon name="plus" size={22} weight="bold" className="lg:hidden" />
          <Icon name="plus" size={20} weight="bold" className="hidden lg:block" />
          <span aria-hidden="true" className="hidden font-medium lg:inline">
            Track spending
          </span>
        </button>
      }
      <QuickAddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </QuickAddContext.Provider>
  )
}

export function useQuickAdd(): QuickAddApi {
  const ctx = useContext(QuickAddContext)
  if (!ctx) throw new Error('useQuickAdd must be used inside <QuickAddProvider>')
  return ctx
}
