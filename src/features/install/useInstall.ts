import { useSyncExternalStore } from 'react'
import { hasInstallPrompt, installContext, subscribeInstallPrompt } from '../../lib/install'

/** The install context, re-evaluated when beforeinstallprompt arrives (it can be late). */
export function useInstallContext() {
  const canPrompt = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt, () => false)
  return installContext(undefined, canPrompt)
}
