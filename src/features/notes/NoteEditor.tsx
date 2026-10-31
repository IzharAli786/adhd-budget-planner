import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useState, type FormEvent } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { getNote, saveNote } from '../../db/repos'
import { NOTE_MAX_LENGTH, noteId, type NoteTarget } from '../../domain/types'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { inputClass } from '../../ui/Field'
import { DisclosureButton, useDisclosure } from '../../ui/Disclosure'
import { Icon } from '../../ui/Icon'

interface Props {
  target: NoteTarget
  title: string
  /** Shown when there is no note yet: what a note here is good for. */
  hint: string
  /** 'card' on a screen, 'plain' inside a sheet that is already a card. */
  variant?: 'card' | 'plain'
  /** Makes the card foldable, remembered under this id (Plan on a phone). */
  foldId?: string
  className?: string
}

/**
 * A few words for a day or a pay period. Read first, edit on tap: a note is something you
 * glance at far more often than you write, so it is not an always-open text box.
 */
export function NoteEditor({ target, title, hint, variant = 'card', foldId, className }: Props) {
  const id = noteId(target)
  // null = no note; undefined = still loading (useLiveQuery's own "not yet").
  const note = useLiveQuery(async () => (await getNote(target)) ?? null, [id])
  const undoToast = useUndoToast()
  const headingId = useId()
  const fieldId = useId()
  const panelId = useId()
  const [open, toggle] = useDisclosure(foldId)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const Heading = variant === 'card' ? 'h2' : 'h3'

  async function save(e?: FormEvent, text = draft ?? '') {
    e?.preventDefault()
    // Unchanged: just close. A toast here would offer to undo some earlier action.
    if (text.trim() === (note?.text ?? '')) return setDraft(null)
    setSaving(true)
    try {
      await saveNote(target, text)
      undoToast(text.trim() ? 'Note saved' : 'Note removed')
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className={cx(variant === 'card' ? 'card p-5' : 'rounded-2xl bg-bg p-4', className)}
    >
      <div className="flex min-h-11 items-center justify-between gap-3">
        <Heading
          id={headingId}
          className={cx(
            'flex items-center gap-2',
            foldId && 'min-w-0 flex-1',
            variant === 'card' ? 'text-heading' : 'font-semibold',
          )}
        >
          {foldId ? (
            <DisclosureButton open={open} onToggle={toggle} controls={panelId}>
              <span className="flex items-center gap-2">
                <Icon name="note" size={18} className="shrink-0 text-accent" />
                {title}
              </span>
            </DisclosureButton>
          ) : (
            <>
              <Icon name="note" size={18} className="text-accent" />
              {title}
            </>
          )}
        </Heading>
        {open && note && draft === null && (
          <Button variant="ghost" onClick={() => setDraft(note.text)} aria-label={`Edit ${title}`}>
            Edit
          </Button>
        )}
      </div>

      {!open
        ? // Folded: the note itself in one line, or nothing when there is none.
          note && <p className="mt-0.5 truncate text-body text-muted">{note.text}</p>
        : null}
      <div id={panelId} hidden={!open}>
        {!open || note === undefined ? null : draft !== null ? (
          <form onSubmit={(e) => void save(e)} className="mt-2 space-y-3">
            <label htmlFor={fieldId} className="sr-only">
              {title}
            </label>
            <textarea
              id={fieldId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={NOTE_MAX_LENGTH}
              rows={3}
              // Only mounted by a tap on "Add a note" or "Edit", so focus is expected here.
              autoFocus
              placeholder={hint}
              className={cx(inputClass, 'resize-y py-3 leading-relaxed')}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={saving}>
                Save note
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
                Cancel
              </Button>
              {note && (
                <Button
                  variant="ghost"
                  className="ml-auto text-muted"
                  disabled={saving}
                  onClick={() => void save(undefined, '')}
                >
                  Remove
                </Button>
              )}
            </div>
          </form>
        ) : note ? (
          <p className="mt-1 text-body break-words whitespace-pre-wrap">{note.text}</p>
        ) : (
          <div className="mt-1 space-y-3">
            <p className="text-body text-muted">{hint}</p>
            <Button variant="secondary" onClick={() => setDraft('')}>
              <Icon name="plus" size={18} />
              Add a note
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
