import { NOTE_MAX_LENGTH, noteId, type Note, type NoteTarget } from '../../domain/types'
import { db } from '../schema'
import { mutate } from '../undo'
import { nowInstant } from './util'

export const listNotes = () => db.notes.toArray()

export const getNote = (target: NoteTarget) => db.notes.get(noteId(target))

/**
 * Writes the note for a day or a pay period, one undo step. Blank text deletes it: an
 * empty note is no note, and leaving a row would put a marker on an empty day.
 */
export function saveNote(target: NoteTarget, text: string) {
  const trimmed = text.trim().slice(0, NOTE_MAX_LENGTH)
  const id = noteId(target)
  return mutate(trimmed ? 'Edit note' : 'Delete note', ['notes'], async (w) => {
    const existing = await w.get('notes', id)
    if (!trimmed) {
      if (existing) await w.delete('notes', id)
      return null
    }
    if (existing?.text === trimmed) return existing
    const note: Note = { id, ...target, text: trimmed, updatedAt: nowInstant() }
    await w.put('notes', note)
    return note
  })
}

/** Ticks a day note off (or back on) in Coming up. One undo step. */
export function setNoteDone(id: string, done: boolean) {
  return mutate(done ? 'Tick off note' : 'Untick note', ['notes'], async (w) => {
    const existing = await w.get('notes', id)
    if (!existing) return null
    const note: Note = { ...existing }
    if (done) note.doneAt = nowInstant()
    else delete note.doneAt
    await w.put('notes', note)
    return note
  })
}
