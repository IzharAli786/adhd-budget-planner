import type { IconName } from '../ui/Icon'

export interface TabDef {
  to: string
  label: string
  icon: IconName
  /** Only shown in Full mode (PLAN §5). */
  full?: boolean
}

export const TABS: readonly TabDef[] = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/plan', label: 'Plan', icon: 'plan', full: true },
  { to: '/bills', label: 'Calendar', icon: 'calendar' },
  { to: '/goals', label: 'Goals', icon: 'goals', full: true },
  { to: '/more', label: 'More', icon: 'more' },
]

export const visibleTabs = (simpleMode: boolean) => TABS.filter((t) => !simpleMode || !t.full)
