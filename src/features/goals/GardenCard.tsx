import { Link } from 'react-router'
import { GARDEN_STAGES } from '../../domain/garden'
import { Icon } from '../../ui/Icon'
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
    <section aria-labelledby="garden-title" className="card p-5">
      <div role="img" aria-label={`Your garden: ${stage.name.toLowerCase()}`}>
        <GardenArt stage={stage.index} />
      </div>
      <div className="mt-2 text-center">
        <p className="eyebrow text-muted">
          Stage {stage.index + 1} of {GARDEN_STAGES.length}
        </p>
        <h2 id="garden-title" className="mt-0.5 text-heading">
          {stage.name}
        </h2>
        <p className="mx-auto mt-1 max-w-xs text-body text-muted">
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

/**
 * The small glance below the fold on Today (PLAN §5). Horizontal and compact: the
 * picture, the stage, and how close the next one is, so the side column isn't half empty.
 */
export function GardenGlance() {
  const garden = useGarden()
  if (!garden) return null
  const { stage, points } = garden
  const toNext = stage.nextAt === null ? null : stage.nextAt - points
  const next = GARDEN_STAGES[stage.index + 1]
  return (
    <Link
      to="/goals"
      className="card-quiet flex min-h-14 items-center gap-4 px-4 py-3 transition-colors hover:bg-accent-soft/40"
    >
      <span className="w-16 shrink-0">
        <GardenArt stage={stage.index} size={64} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-muted">Your garden</span>
        <span className="block font-medium">{stage.name}</span>
        <span className="mt-0.5 block text-sm text-muted">
          {toNext === null || !next
            ? 'Fully grown'
            : `Next: ${next.name.toLowerCase()}, ${toNext} ${toNext === 1 ? 'good moment' : 'good moments'} away`}
        </span>
        {/* Decorative here: the line above already says how far, in words. */}
        {toNext !== null && (
          <span aria-hidden="true" className="mt-2 block">
            <ProgressBar value={stage.progress} label="Growth to the next stage" />
          </span>
        )}
      </span>
      <Icon name="chevron" size={18} className="shrink-0 text-muted" />
    </Link>
  )
}
