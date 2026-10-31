import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { latestCheckIn, listBills, listImpulse, listOccurrences } from '../db/repos'
import { badgeCount, BADGE_DAYS } from '../domain/badge'
import { addedOnMap, billEntriesBetween } from '../domain/bills'
import { addDays } from '../domain/dates'
import { todayISO } from '../lib/clock'
import { badgeEnabled, badgePlatform, setBadge } from '../lib/badge'
import { useNow } from '../lib/useNow'
import { useToday } from '../lib/useToday'
import { useAppSettings } from './SettingsProvider'

const localDate = (at: string) => todayISO(new Date(at))

/** Keeps the home-screen badge in step with the data. Renders nothing. */
export function AppBadge() {
  const { settings, loaded } = useAppSettings()
  const platform = badgePlatform()
  const on = loaded && badgeEnabled(platform, settings.appBadge)
  const today = useToday()
  const now = useNow()

  const count = useLiveQuery(async () => {
    if (!on) return 0
    const [bills, occurrences, impulse, checkIn] = await Promise.all([
      listBills(),
      listOccurrences(),
      listImpulse(),
      latestCheckIn(),
    ])
    // From the last check-in: older unpaid bills were settled (or asked about) there.
    const from = checkIn && checkIn.date < today ? checkIn.date : today
    const addedOn = addedOnMap(bills, localDate)
    const entries = billEntriesBetween(
      bills,
      occurrences,
      from,
      addDays(today, BADGE_DAYS + 1),
    ).filter((e) => e.date >= (addedOn.get(e.billId) ?? e.date))
    return badgeCount({ entries, impulse, today, now })
  }, [on, today, now])

  useEffect(() => {
    if (platform === 'none' || !loaded || count === undefined) return
    void setBadge(count)
  }, [platform, loaded, count])

  return null
}
