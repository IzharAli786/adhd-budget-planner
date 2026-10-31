import { beforeEach, describe, expect, it } from 'vitest'
import { exportBackup, validateBackup } from '../backup'
import {
  completeSetup,
  getSetupProgress,
  listCheckIns,
  listIncomes,
  saveSetupProgress,
  SetupIncompleteError,
  setupComplete,
} from '../repos'
import { db } from '../schema'
import { resetDb } from './helpers'

const AT = '2026-10-31T10:00:00.000Z'
const TODAY = '2026-10-31'

beforeEach(resetDb)

async function answerAll(kind: 'monthly' | 'semimonthly' = 'monthly') {
  await saveSetupProgress({ step: 'payday', ackAt: AT })
  await saveSetupProgress({ step: 'pay', nextPayday: '2026-11-27' })
  await saveSetupProgress({ step: 'balance', kind, amount: 210000 })
}

describe('setup progress', () => {
  it('merges each step into one row', async () => {
    await answerAll()
    expect(await getSetupProgress()).toEqual({
      step: 'balance',
      ackAt: AT,
      nextPayday: '2026-11-27',
      kind: 'monthly',
      amount: 210000,
    })
    expect(await setupComplete()).toBe(false)
  })

  it('survives closing and reopening the database (a killed app)', async () => {
    await answerAll()
    db.close()
    await db.open()
    expect((await getSetupProgress())?.step).toBe('balance')
  })
})

describe('completeSetup', () => {
  it('creates the primary income and the first check-in, then marks setup done', async () => {
    await answerAll()
    expect(await completeSetup(84250, TODAY, AT)).toBe(true)

    expect(await listIncomes()).toEqual([
      {
        id: expect.any(String),
        name: 'Pay',
        amount: 210000,
        schedule: { kind: 'monthly', day: 27 },
        weekendRule: 'before',
        primary: true,
        active: true,
      },
    ])
    expect(await listCheckIns()).toEqual([
      { id: expect.any(String), at: AT, date: TODAY, balance: 84250 },
    ])
    expect(await getSetupProgress()).toMatchObject({ step: 'done', doneAt: AT })
    expect(await setupComplete()).toBe(true)
  })

  it('stores an overdrawn balance as negative', async () => {
    await answerAll()
    await completeSetup(-1500, TODAY, AT)
    expect((await listCheckIns())[0]?.balance).toBe(-1500)
  })

  it('is idempotent: a double tap or retry never duplicates anything', async () => {
    await answerAll()
    const results = await Promise.all([
      completeSetup(84250, TODAY, AT),
      completeSetup(84250, TODAY, AT),
      completeSetup(84250, TODAY, AT),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await completeSetup(84250, TODAY, AT)).toBe(false)
    expect(await listIncomes()).toHaveLength(1)
    expect(await listCheckIns()).toHaveLength(1)
  })

  it('refuses to finish without the answers', async () => {
    await saveSetupProgress({ step: 'balance', ackAt: AT })
    await expect(completeSetup(100, TODAY, AT)).rejects.toBeInstanceOf(SetupIncompleteError)
    expect(await listIncomes()).toEqual([])
    expect(await listCheckIns()).toEqual([])
  })

  it('is not undoable (setup is not a user edit to take back)', async () => {
    await answerAll()
    await completeSetup(100, TODAY, AT)
    expect(await db.undo.count()).toBe(0)
  })
})

describe('setupProgress in backups', () => {
  it('round-trips a real progress row', async () => {
    await answerAll('semimonthly')
    const result = validateBackup(await exportBackup())
    expect(result.ok).toBe(true)
  })

  it('rejects a malformed progress row', async () => {
    const file = await exportBackup()
    file.data.meta.push({ key: 'setupProgress', value: { step: 'warp', amount: -5 } })
    const result = validateBackup(file)
    expect(result.ok).toBe(false)
  })
})
