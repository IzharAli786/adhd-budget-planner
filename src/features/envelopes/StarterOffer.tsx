import { useState } from 'react'
import { useUndoToast } from '../../app/useUndoToast'
import { addStarterEnvelopes } from '../../db/repos'
import { STARTER_CATEGORIES } from '../../domain/categories'
import { Button } from '../../ui/Button'
import { EnvelopeLabel } from '../../ui/EnvelopeDot'

const SKIP_KEY = 'steady:starter-categories'
// Per device on purpose: it only hides an offer, and storage can be unavailable (private
// mode), in which case the offer simply shows again. Adding any envelope also hides it.
export function readStarterSkipped() {
  try {
    return localStorage.getItem(SKIP_KEY) === 'skipped'
  } catch {
    return false
  }
}
function writeSkipped() {
  try {
    localStorage.setItem(SKIP_KEY, 'skipped')
  } catch {
    // Nothing to do: the offer is hidden for this visit anyway.
  }
}

/** One tap to a sensible set, skippable; budgets stay empty so nothing is decided for you. */
export function StarterOffer({ onSkip }: { onSkip: () => void }) {
  const undoToast = useUndoToast()
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    try {
      const added = await addStarterEnvelopes()
      // Nothing added means no undo step, so no Undo to offer either.
      if (added > 0) undoToast(added === 1 ? 'Added 1 category' : `Added ${added} categories`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="starter-title" className="card p-5 sm:p-6">
      <h2 id="starter-title" className="section-title">
        Start with common categories?
      </h2>
      <p className="mt-1.5 text-body text-muted">
        Ten everyday envelopes, ready to use. Budgets start empty: fill in only the ones you care
        about, rename or delete the rest.
      </p>
      <ul aria-label="Categories it adds" className="mt-4 flex flex-wrap gap-1.5">
        {STARTER_CATEGORIES.map((c) => (
          <li key={c.name} className="inline-flex">
            <EnvelopeLabel name={c.name} color={c.color} />
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => void add()} disabled={busy}>
          Start with common categories
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            writeSkipped()
            onSkip()
          }}
        >
          I’ll make my own
        </Button>
      </div>
    </section>
  )
}
