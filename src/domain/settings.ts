// User preferences, stored as one row in meta under 'settings'. Plain data so the
// same object travels through IndexedDB, backups and React without conversion.
import type { Cents } from './money'

export const THEMES = ['clay', 'sage', 'ocean', 'blush', 'sand', 'midnight'] as const
export type Theme = (typeof THEMES)[number]
export type ColorMode = 'auto' | 'light' | 'dark'
export type MotionPreference = 'auto' | 'on' | 'off'
/** 0 = Sunday ... 6 = Saturday, same convention as dayOfWeek(). */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Settings {
  locale: string
  currency: string
  decimals: number
  weekStart: WeekStart
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
}

export const DEFAULT_SETTINGS: Settings = {
  locale: 'en-IE',
  currency: 'EUR',
  decimals: 2,
  weekStart: 1,
  theme: 'clay',
  mode: 'auto',
  // New users start simple (PLAN §1.6); Full tools are one toggle away.
  simpleMode: true,
  largeText: 100,
  reducedMotion: 'auto',
  buffer: 0,
  // Off by default (PLAN §10 M9): most people start with one number, not categories.
  envelopesEnabled: false,
  appBadge: null,
}

/** Fills missing fields so rows written by older versions still read as full Settings. */
export function withDefaults(partial: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...partial }
}
