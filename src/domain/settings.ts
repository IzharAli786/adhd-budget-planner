// User preferences, stored as one row in meta under 'settings'. Plain data so the
// same object travels through IndexedDB, backups and React without conversion.
import type { Cents } from './money'
import type { ISODate } from './types'

export const THEMES = ['clay', 'sage', 'ocean', 'blush', 'sand', 'midnight'] as const
export type Theme = (typeof THEMES)[number]
export type ColorMode = 'auto' | 'light' | 'dark'
export type MotionPreference = 'auto' | 'on' | 'off'
/** 0 = Sunday ... 6 = Saturday, same convention as dayOfWeek(). */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6
/** Short dates as words ("Fri 7 Nov") or numbers in the locale's order ("Fri 07/11"). */
export const DATE_STYLES = ['words', 'numbers'] as const
export type DateStyle = (typeof DATE_STYLES)[number]

export interface Settings {
  locale: string
  currency: string
  decimals: number
  weekStart: WeekStart
  dateStyle: DateStyle
  theme: Theme
  mode: ColorMode
  simpleMode: boolean
  /** Root font size in percent, 100-150. */
  largeText: number
  reducedMotion: MotionPreference
  /** Kept aside from safe-to-spend as a cushion. */
  buffer: Cents
  envelopesEnabled: boolean
  /** App-icon badge; null = the platform default (on in Chromium, off on iOS). */
  appBadge: boolean | null
  /** Low-energy Today (PLAN §5): the number and one card, nothing else. */
  justToday: boolean
  /** Optional first name for Today's greeting. Empty = "Good morning" on its own. */
  displayName: string
  /** A custom accent (#rrggbb) that passed the contrast check, or null for the theme's. */
  accent: string | null
  /** Budget by calendar month (like most planners) or from payday to payday. */
  planBy: 'month' | 'payday'
  /** Money you had before you started tracking. Added once, to the first period. */
  startingBalance: Cents
  /** First day tracked; null until the app records it (setup, or first open after v2). */
  startDate: ISODate | null
  /** Carry each period's leftover into the next one. */
  rollover: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'en-IE',
  currency: 'EUR',
  decimals: 2,
  weekStart: 1,
  dateStyle: 'words',
  theme: 'clay',
  mode: 'auto',
  // Everything visible from the start (user feedback: Plan and Goals felt hidden behind a
  // toggle); "Show more tools" off is now the way to simplify, not the way to discover.
  simpleMode: false,
  largeText: 100,
  reducedMotion: 'auto',
  buffer: 0,
  // On by default (PLAN-v2 decision 18): budget vs actual works out of the box. A budget of
  // 0 reads "No budget set", so it changes no number. Existing installs keep their choice.
  envelopesEnabled: true,
  appBadge: null,
  justToday: false,
  displayName: '',
  accent: null,
  planBy: 'month',
  startingBalance: 0,
  startDate: null,
  rollover: false,
}

/** Fills missing fields so rows written by older versions still read as full Settings. */
export function withDefaults(partial: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...partial }
}
