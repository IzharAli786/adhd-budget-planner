import { beforeEach, describe, expect, it } from 'vitest'
import {
  addEnvelope,
  addStarterEnvelopes,
  ensureDefaultEnvelope,
  getNote,
  listEnvelopes,
  listNotes,
  saveNote,
} from '../repos'
import { db } from '../schema'
import { lastUndo, undoLast } from '../undo'
import { resetDb } from './helpers'

beforeEach(resetDb)

describe('saveNote', () => {
  it('keeps one note per day and per period, trims, and deletes on blank', async () => {
    await saveNote({ date: '2026-11-02' }, '  first  ')
    await saveNote({ date: '2026-11-02' }, 'second')
    await saveNote({ periodStart: '2026-10-30' }, 'period')
    expect(await listNotes()).toHaveLength(2)
    expect(await getNote({ date: '2026-11-02' })).toMatchObject({
      id: 'day|2026-11-02',
      date: '2026-11-02',
      text: 'second',
    })
    expect(await getNote({ date: '2026-11-02' })).not.toHaveProperty('periodStart')
    expect(await db.notes.where('periodStart').equals('2026-10-30').count()).toBe(1)

    await saveNote({ date: '2026-11-02' }, '   ')
    expect(await getNote({ date: '2026-11-02' })).toBeUndefined()
    expect(await undoLast()).toBe('Delete note')
    expect((await getNote({ date: '2026-11-02' }))?.text).toBe('second')
  })

  it('an unchanged save writes nothing and adds no undo step', async () => {
    await saveNote({ date: '2026-11-02' }, 'same')
    const before = await lastUndo()
    await saveNote({ date: '2026-11-02' }, ' same ')
    expect((await lastUndo())?.seq).toBe(before?.seq)
    await saveNote({ date: '2026-11-03' }, '')
    expect((await lastUndo())?.seq).toBe(before?.seq)
  })
})

describe('addStarterEnvelopes', () => {
  it('adds the missing ones after the existing envelopes, in one undo step', async () => {
    await ensureDefaultEnvelope()
    await addEnvelope({ name: 'Groceries', budget: 20000, color: 'sage' })
    expect(await addStarterEnvelopes()).toBe(9)
    const all = await listEnvelopes()
    expect(all).toHaveLength(11)
    expect(all.map((e) => e.sort)).toEqual([...Array(11).keys()])
    expect(all.filter((e) => e.name === 'Groceries')).toHaveLength(1)
    expect(await addStarterEnvelopes()).toBe(0)

    expect(await undoLast()).toBe('Add common categories')
    expect(await listEnvelopes()).toHaveLength(2)
  })
})
