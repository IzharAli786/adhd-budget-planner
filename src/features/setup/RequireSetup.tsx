import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { setupComplete } from '../../db/repos'

/** Until first-run setup is done, every app route leads to /setup (and resumes there). */
export function RequireSetup({ children }: { children: ReactNode }) {
  const complete = useLiveQuery(setupComplete)
  if (complete === undefined) return null
  return complete ? children : <Navigate to="/setup" replace />
}
