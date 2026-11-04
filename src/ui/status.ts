// One source of truth for every status label, tone and glyph in the app (design spec §5).
// A status always carries a word and a glyph; the tone is the third signal, never the only one.
import { createElement } from 'react'
import type { LifeGoalStatus } from '../domain/types'
import { Badge, type Tone } from './Badge'
import type { IconName } from './Icon'

export interface StatusSpec {
  label: string
  tone: Tone
  icon?: IconName
}

export const GOAL_STATUS: Record<LifeGoalStatus, StatusSpec> = {
  todo: { label: 'Not started', tone: 'neutral', icon: 'circleDashed' },
  doing: { label: 'In progress', tone: 'progress', icon: 'circleHalf' },
  done: { label: 'Done', tone: 'success', icon: 'check' },
}

export const BILL_STATUS = {
  overdue: { label: 'Overdue', tone: 'attention', icon: 'alert' },
  paid: { label: 'Paid', tone: 'success', icon: 'check' },
  skipped: { label: 'Skipped', tone: 'neutral', icon: 'skip' },
  autopay: { label: 'Autopay', tone: 'info', icon: 'repeat' },
  debtMinimum: { label: 'Debt minimum', tone: 'neutral', icon: 'card' },
} satisfies Record<string, StatusSpec>

export const TAG = {
  bill: { label: 'Bill', tone: 'neutral', icon: 'bills' },
  payday: { label: 'Payday', tone: 'success', icon: 'payday' },
  main: { label: 'Main', tone: 'info' },
  focusFirst: { label: 'Focus first', tone: 'info', icon: 'flag' },
  paidOff: { label: 'Paid off', tone: 'success', icon: 'check' },
  moreTools: { label: 'More tools', tone: 'neutral' },
} satisfies Record<string, StatusSpec>

/** A Badge for a StatusSpec: <StatusBadge status={BILL_STATUS.overdue} />. */
export function StatusBadge({
  status,
  size = 'sm',
  icon = true,
  className,
}: {
  status: StatusSpec
  size?: 'sm' | 'md'
  /** false when a disc or glyph beside it already shows the status's glyph. */
  icon?: boolean
  className?: string
}) {
  return createElement(Badge, {
    tone: status.tone,
    icon: icon ? status.icon : undefined,
    size,
    className,
    children: status.label,
  })
}
