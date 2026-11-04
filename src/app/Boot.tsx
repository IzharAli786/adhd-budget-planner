import { useEffect, useState, type ReactNode } from 'react'
import { db } from '../db/schema'
import { openDatabase } from '../db/snapshot'
import { Button } from '../ui/Button'
import { Logo } from '../ui/Logo'

type State = { status: 'opening' } | { status: 'ready' } | { status: 'failed'; error: Error }

// The database does not auto-open (db/schema.ts): a migration must snapshot first, so
// nothing may query before openDatabase() has run. This gate guarantees that ordering.
export function Boot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() =>
    db.isOpen() ? { status: 'ready' } : { status: 'opening' },
  )

  useEffect(() => {
    if (state.status !== 'opening') return
    let live = true
    openDatabase(db).then(
      () => live && setState({ status: 'ready' }),
      (error: unknown) =>
        live &&
        setState({
          status: 'failed',
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    )
    return () => {
      live = false
    }
  }, [state.status])

  if (state.status === 'ready') return children
  if (state.status === 'opening') {
    // Usually a few ms; render the brand quietly instead of a spinner flash.
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-busy="true">
        {/* The mark is decorative on its own; this wrapper carries what it means here. */}
        <span role="img" aria-label="Steady is starting" className="animate-fade-in">
          <Logo size={56} />
        </span>
      </div>
    )
  }
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 text-center"
    >
      <h1 className="text-xl font-semibold">Steady couldn’t open its storage</h1>
      <p className="mt-2 text-muted">
        {state.error.name === 'VersionError' || state.error.name === 'DatabaseClosedError'
          ? 'Another tab may be running an older version. Close other Steady tabs and try again.'
          : 'Your browser blocked storage. Private browsing can do this. Your data has not been touched.'}
      </p>
      <Button size="lg" onClick={() => location.reload()} className="mx-auto mt-6">
        Try again
      </Button>
    </div>
  )
}
