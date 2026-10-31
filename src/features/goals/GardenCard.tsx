import { Link } from 'react-router'
import { GARDEN_STAGES } from '../../domain/garden'
import { ProgressBar } from '../../ui/Progress'
import { GardenArt } from './GardenArt'
import { useGarden } from './useGarden'

/** The garden on Goals: picture, stage name, and what makes it grow. */
export function GardenCard() {
  const garden = useGarden()
  if (!garden)
    return <div aria-hidden="true" className="h-72 animate-pulse rounded-3xl bg-surface" />
  const { stage, points } = garden
  const toNext = stage.nextAt === null ? null : stage.nextAt - points

  return (
    <section
      aria-labelledby="garden-title"
      className="rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line"
    >
      <div role="img" aria-label={`Your garden: ${stage.name.toLowerCase()}`}>
        <GardenArt stage={stage.index} />
      </div>
      <div className="mt-2 text-center">
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Stage {stage.index + 1} of {GARDEN_STAGES.length}
        </p>
        <h2 id="garden-title" className="mt-0.5 text-lg font-semibold">
          {stage.name}
        </h2>
        <p className="mx-auto mt-1 max-w-xs text-[0.9375rem] text-muted">
          {toNext === null
            ? 'Fully grown. It stays this way, whatever happens.'
            : `${toNext} more ${toNext === 1 ? 'good moment' : 'good moments'} until it grows again.`}
        </p>
        {toNext !== null && (
          <ProgressBar
            value={stage.progress}
            label="Growth to the next stage"
            className="mx-auto mt-3 max-w-48"
          />
        )}
      </div>
      <p className="mt-4 rounded-2xl bg-bg px-4 py-3 text-sm text-muted">
        It grows when you check your balance, pay a bill, have a no-spend day or skip something on
        your 48-hour list. It never shrinks.
      </p>
    </section>
  )
}

/** The small glance below the fold on Today (PLAN §5). */
export function GardenGlance() {
  const garden = useGarden()
  if (!garden) return null
  return (
    <Link
      to="/goals"
      className="flex min-h-14 items-center gap-3 rounded-3xl bg-surface px-4 py-2 shadow-card ring-1 ring-line transition-colors hover:bg-accent-soft/40"
    >
      <span className="w-16 shrink-0">
        <GardenArt stage={garden.stage.index} size={64} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">Your garden</span>
        <span className="block font-medium">{garden.stage.name}</span>
      </span>
    </Link>
  )
}
