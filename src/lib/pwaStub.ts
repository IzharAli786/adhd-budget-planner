// Stands in for 'virtual:pwa-register/react' where there is no service worker: the demo
// build (PLAN §7) and unit tests. Same shape, never reports an update.
import { useState } from 'react'

export function useRegisterSW() {
  return {
    needRefresh: useState(false),
    offlineReady: useState(false),
    updateServiceWorker: async () => {},
  }
}
