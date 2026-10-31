import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { INSTALL_FLOW, installContext } from '../lib/install'
import { useAppSettings } from './SettingsProvider'

/**
 * Plan and Goals only exist in Full mode (PLAN §5). Without this, switching back to
 * Simple while on /goals leaves the user on a screen no tab points at, and an old
 * bookmark opens a "hidden" tool. Waits for settings so a Full-mode user's deep link
 * isn't bounced by the defaults shown during the first read.
 */
export function FullOnly({ children }: { children: ReactNode }) {
  const { settings, loaded } = useAppSettings()
  if (!loaded) return null
  return settings.simpleMode ? <Navigate to="/" replace /> : children
}

/**
 * /start is the short address printed in the PDF (PLAN §6). It sends each device to the
 * right flow: iPhone and in-app browsers land on Today, where the install gate takes
 * over; browsers that can install get the install screen; the installed app goes home.
 */
export function StartRoute() {
  const ctx = installContext()
  const to = INSTALL_FLOW && (ctx === 'prompt' || ctx === 'unsupported') ? '/more/install' : '/'
  return <Navigate to={to} replace />
}
