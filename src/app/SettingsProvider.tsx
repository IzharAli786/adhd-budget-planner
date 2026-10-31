import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useSettings } from '../db/hooks'
import { updateSettings } from '../db/repos'
import { DEFAULT_SETTINGS, type Settings } from '../domain/settings'
import { applyAppearance } from './theme'

interface SettingsContextValue {
  settings: Settings
  /** False until IndexedDB has answered; defaults are shown meanwhile. */
  loaded: boolean
  update: (patch: Partial<Settings>) => Promise<Settings>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

// IndexedDB is the source of truth; this context only spreads the live row so every
// screen doesn't open its own query, and keeps <html> in sync with it.
export function SettingsProvider({ children }: { children: ReactNode }) {
  const stored = useSettings()
  const settings = stored ?? DEFAULT_SETTINGS
  const loaded = stored !== undefined

  useEffect(() => {
    if (loaded) applyAppearance(settings)
  }, [loaded, settings])

  const update = useCallback((patch: Partial<Settings>) => updateSettings(patch), [])
  const value = useMemo(() => ({ settings, loaded, update }), [settings, loaded, update])

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useAppSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useAppSettings must be used inside <SettingsProvider>')
  return ctx
}
