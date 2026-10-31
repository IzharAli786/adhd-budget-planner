import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { useBillOccurrences, useCheckIns, useImpulse, useNoSpend } from '../../db/hooks'
import { getMeta, setMeta } from '../../db/repos'
import { gardenPoints, gardenStage, keptPoints } from '../../domain/garden'

/** The garden's points (best ever reached) and stage, or null while loading. */
export function useGarden() {
  const checkIns = useCheckIns()
  const occurrences = useBillOccurrences()
  const noSpend = useNoSpend()
  const impulse = useImpulse()
  // `?? 0` inside the query: useLiveQuery's own undefined means "still loading".
  const stored = useLiveQuery(async () => (await getMeta<number>('gardenPoints')) ?? 0)

  const computed =
    checkIns && occurrences && noSpend && impulse
      ? gardenPoints({ checkIns, occurrences, noSpend, impulse })
      : undefined

  // Persist a new high-water mark so the garden never shrinks after an undo or delete.
  // An effect, not a write during render: rendering must stay free of side effects.
  useEffect(() => {
    if (computed !== undefined && stored !== undefined && computed > stored)
      void setMeta('gardenPoints', computed)
  }, [computed, stored])

  return useMemo(() => {
    if (computed === undefined || stored === undefined) return null
    const points = keptPoints(stored, computed)
    return { points, stage: gardenStage(points) }
  }, [computed, stored])
}
