import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useRef, useState, type FormEvent } from 'react'
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
  /** What a note here is good for: shown when there is none, or as the box's placeholder. */
  hint: string
  /**
   * 'card' on a screen, 'plain' inside a sheet that is already a card, 'inline' under a
   * section heading the screen draws itself (Home): just the text box, always open.
   */
  variant?: 'card' | 'plain' | 'inline'
  /** 'inline' only: the id of the heading that names the box. */
  labelledBy?: string
  /** Makes the card foldable, remembered under this id (Plan on a phone). */
  foldId?: string
  className?: string
}

export function NoteEditor(props: Props) {
  return props.variant === 'inline' ? <InlineNote {...props} /> : <NoteCard {...props} />
}

/** The note for a target, and a save that undoes in one tap. Unchanged text writes nothing. */
function useNote(target: NoteTarget) {
  const id = noteId(target)
  // null = no note; undefined = still loading (useLiveQuery's own "not yet").
  const note = useLiveQuery(async () => (await getNote(target)) ?? null, [id])
  const undoToast = useUndoToast()
  async function write(text: string) {
    // Unchanged: nothing to do. A toast here would offer to undo some earlier action.
    if (text.trim() === (note?.text ?? '')) return
    await saveNote(target, text)
    undoToast(text.trim() ? 'Note saved' : 'Note removed')
  }
  return { note, write }
}

/**
 * Always open, like a page in a notebook: the box shows the note, typing changes it, and
 * leaving the box (or Save) keeps it. Emptying the box removes the note.
 */
function InlineNote({ target, title, hint, labelledBy, className }: Props) {
  const { note, write } = useNote(target)
  const fieldId = useId()
  const [draft, setDraft] = useState<string | null>(null)
  // One save at a time: a click on Save also blurs the box, and both ask to save.
  const busy = useRef(false)

  async function save() {
    if (draft === null || busy.current) return
    const text = draft
    busy.current = true
    try {
      await write(text)
      // Anything typed while it saved stays as the new draft.
      setDraft((d) => (d === text ? null : d))
    } finally {
      busy.current = false
    }
  }

  return (
    <form
      className={cx('space-y-3', className)}
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      onBlur={(e) => {
        // Moving from the box to its own Save button is not leaving the note.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void save()
      }}
    >
      {!labelledBy && (
        <label htmlFor={fieldId} className="sr-only">
          {title}
        </label>
      )}
      <textarea
        id={fieldId}
        aria-labelledby={labelledBy}
        value={draft ?? note?.text ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={note === undefined}
        maxLength={NOTE_MAX_LENGTH}
        rows={4}
        placeholder={hint}
        className={cx(inputClass, 'block resize-y py-3 leading-relaxed')}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-caption text-muted">Saves by itself when you leave the box.</p>
        <Button type="submit" variant="secondary" className="ml-auto">
          Save
        </Button>
      </div>
    </form>
  )
}

/**
 * A few words for a day or a pay period. Read first, edit on tap: a note is something you
 * glance at far more often than you write, so it is not an always-open text box.
 */
function NoteCard({ target, title, hint, variant = 'card', foldId, className }: Props) {
  const { note, write } = useNote(target)
  const headingId = useId()
  const fieldId = useId()
  const panelId = useId()
  const [open, toggle] = useDisclosure(foldId)
  const [draft, setDraft] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const Heading = variant === 'card' ? 'h2' : 'h3'

  async function save(e?: FormEvent, text = draft ?? '') {
    e?.preventDefault()
    setSaving(true)
    try {
      await write(text)
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
          <Button
            variant="quiet"
            className="-mr-3"
            onClick={() => setDraft(note.text)}
            aria-label={`Edit ${title}`}
          >
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
                  variant="quiet"
                  icon="trash"
                  className="ml-auto"
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
            <Button variant="secondary" icon="plus" onClick={() => setDraft('')}>
              Add a note
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
