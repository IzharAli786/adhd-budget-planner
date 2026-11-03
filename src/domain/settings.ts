// User preferences, stored as one row in meta under 'settings'. Plain data so the
// same object travels through IndexedDB, backups and React without conversion.
// The money settings (start, roll over, cushion) live in their own row, meta.plan
// (domain/plan.ts), so undoing one never undoes a theme change (PLAN-v2 decision 3).

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
  envelopesEnabled: boolean
  /** App-icon badge; null = the platform default (on in Chromium, off on iOS). */
  appBadge: boolean | null
  /** Low-energy Today (PLAN §5): the number and one card, nothing else. */
  justToday: boolean
  /** Optional first name for Today's greeting. Empty = "Good morning" on its own. */
  displayName: string
  /** A custom accent (#rrggbb) that passed the contrast check, or null for the theme's. */
  accent: string | null
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
  // On by default (PLAN-v2 decision 18) with only "Everyday" at budget 0, which gives
  // exactly the numbers of envelopes off. The v5 migration pins `false` where it was off.
  envelopesEnabled: true,
  appBadge: null,
  justToday: false,
  displayName: '',
  accent: null,
}

/** Fills missing fields so rows written by older versions still read as full Settings. */
export function withDefaults(partial: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...partial }
}
