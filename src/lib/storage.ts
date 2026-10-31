// Browsers may evict IndexedDB under storage pressure unless the origin is "persisted".
// Asking is cheap and idempotent, so we ask after setup and again on later opens if denied.

export interface StorageStatus {
  supported: boolean
  persisted: boolean
  /** Bytes used and available, when the browser reports them. */
  usage?: number
  quota?: number
}

export async function requestPersist(): Promise<boolean> {
  const storage = globalThis.navigator?.storage
  if (!storage?.persist) return false
  try {
    if (await storage.persisted()) return true
    return await storage.persist()
  } catch {
    return false
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  const storage = globalThis.navigator?.storage
  if (!storage?.persisted) return { supported: false, persisted: false }
  try {
    const [persisted, estimate] = await Promise.all([
      storage.persisted(),
      storage.estimate ? storage.estimate() : Promise.resolve({} as StorageEstimate),
    ])
    return { supported: true, persisted, usage: estimate.usage, quota: estimate.quota }
  } catch {
    return { supported: true, persisted: false }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}
