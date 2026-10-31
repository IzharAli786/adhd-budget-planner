// "Erase everything on this device" (More > Backup). Every table, the undo log and meta
// included, goes in one transaction, so a crash can't leave half a household behind. The
// unlock flag lives in meta too: the next screen asks for the code again, as the dialog says.
import { Dexie } from 'dexie'
import { db } from './schema'
import { snapshotDbName } from './snapshot'

// Per-device conveniences that would otherwise survive and look like leftover data.
const LOCAL_KEYS = ['steady:appearance', 'steady:starter-categories']

export async function eraseEverything(): Promise<void> {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())))
  // The safety copies hold the same money data; "everything" has to mean them too.
  await Dexie.delete(snapshotDbName(db.name)).catch(() => {})
  try {
    for (const key of LOCAL_KEYS) localStorage.removeItem(key)
  } catch {
    // Blocked storage: nothing was cached there either.
  }
}
