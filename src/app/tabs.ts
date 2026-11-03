import type { IconName } from '../ui/Icon'

export interface TabDef {
  to: string
  label: string
  icon: IconName
  /** Only shown in Full mode (PLAN §5). */
  full?: boolean
  /** In the phone's bottom bar too; the rest are in the side rail and under More. */
  phone?: boolean
}

// The sections in the order the planner is used: set up, see the month, act today, plan
// the calendar, then the bigger picture (goals, savings, debt), envelopes and the year.
export const TABS: readonly TabDef[] = [
  { to: '/getting-started', label: 'Getting started', icon: 'info' },
  { to: '/home', label: 'Home', icon: 'plan', full: true, phone: true },
  { to: '/', label: 'Today', icon: 'today', phone: true },
  { to: '/bills', label: 'Calendar', icon: 'calendar', phone: true },
  { to: '/goals', label: 'Goals', icon: 'goals', full: true },
  { to: '/savings', label: 'Savings', icon: 'sprout', full: true },
  { to: '/debt', label: 'Debt', icon: 'wallet', full: true },
  { to: '/envelopes', label: 'Envelopes', icon: 'envelope', full: true, phone: true },
  { to: '/review', label: 'Yearly review', icon: 'history', full: true },
  { to: '/more/settings', label: 'Settings', icon: 'palette' },
  { to: '/more', label: 'More', icon: 'more', phone: true },
]

export const visibleTabs = (simpleMode: boolean) => TABS.filter((t) => !simpleMode || !t.full)
