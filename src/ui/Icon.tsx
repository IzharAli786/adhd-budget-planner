import type { SVGProps } from 'react'

// A tiny inline line-icon set (24px grid, round caps and joins, rounded corners). Every
// icon in the app comes from here so weights match: the stroke is computed per size
// (strokeFor), so a 14px and a 22px icon look equally heavy. Inline SVG keeps icons in
// the precached JS bundle, themeable via currentColor, with no icon-font request.
const PATHS = {
  today:
    'M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  bills: 'M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1ZM9 8h6M9 12h6M9 16h3',
  plan: 'M4 19h16M6 16V11M10 16V7M14 16v-6M18 16V5',
  goals:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  // Solid dots (FILLS below): stroked dots looked like specks at 1.5px.
  more: '',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
  plusSquare:
    'M12 8v8M8 12h8M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  download: 'M12 3v12M8 11l4 4 4-4M5 21h14',
  upload: 'M12 21V9M8 13l4-4 4 4M5 3h14',
  palette:
    'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3c.4.5.5 1 .5 1.2 0 .8-1.2 1.5-3 1.5ZM7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  shield: 'M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.01',
  copy: 'M10 9h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 15V4a1 1 0 0 1 1-1h9',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  phone: 'M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM11 18h2',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  plus: 'M12 5v14M5 12h14',
  calendar:
    'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  payday:
    'M5 6h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM6.5 12h.01M17.5 12h.01',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  skip: 'M6 5l8 7-8 7M18 5v14',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  // Sections and tools (More's "Show more tools"): four rounded tiles.
  grid: 'M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1ZM15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1Z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  note: 'M6 4h12a1 1 0 0 1 1 1v10l-5 5H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM14 20v-4a1 1 0 0 1 1-1h4M8.5 9h7M8.5 12.5h4',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7',
  envelope:
    'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3.5 7.5l8.5 6 8.5-6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  wallet:
    'M4 7a2 2 0 0 1 2-2h11v4M4 7v10a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H6a2 2 0 0 1-2-2ZM16 14h.01',
  sprout: 'M12 20v-8M12 12c0-4-3-6-7-6 0 4 3 6 7 6ZM12 10c0-3.5 2.5-5.5 7-5.5 0 3.5-2.5 5.5-7 5.5Z',
  report:
    'M7 3h7.5L19 7.5V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v4.5h5M9.5 17.5v-3M12.5 17.5v-6M15.5 17.5v-4.5',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5v4h4M12 7.5V12l3 2',
  print:
    'M7 9V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M8 14h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z',
  // Statuses (ui/status.ts): each status has a glyph of its own, never borrowed.
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.75v4.75M12 16.25h.01',
  repeat: 'M17 3.5l3 3-3 3M4 11.5v-1a4 4 0 0 1 4-4h12M7 20.5l-3-3 3-3M20 12.5v1a4 4 0 0 1-4 4H4',
  card: 'M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM3 10h18M7 15h3',
  circleDashed:
    'M10.2 3.2a9 9 0 0 1 3.6 0M17.6 5a9 9 0 0 1 1.9 2.6M20.8 10.2a9 9 0 0 1 0 3.6M19 17.6a9 9 0 0 1-2.6 1.9M13.8 20.8a9 9 0 0 1-3.6 0M6.4 19a9 9 0 0 1-1.9-2.6M3.2 13.8a9 9 0 0 1 0-3.6M5 6.4a9 9 0 0 1 2.6-1.9',
  circleHalf: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z',
  flag: 'M5.5 21V4M5.5 4H17l-2.5 4 2.5 4H5.5',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  minus: 'M6 12h12',
} as const

export type IconName = keyof typeof PATHS

/** Solid parts, drawn on top of the strokes: the "more" dots, the half of circleHalf. */
const FILLS: Partial<Record<IconName, string>> = {
  more: 'M5 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM12 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM19 13.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z',
  circleHalf: 'M12 6a6 6 0 0 1 0 12Z',
}

/**
 * The optical scale: 12 inside badges, 14 inline with captions, 16 in sm buttons, 18 in
 * md buttons and dense row actions, 20 for icon buttons and tiles, 22 for navigation.
 */
export type IconSize = 12 | 14 | 16 | 18 | 20 | 22

export type IconWeight = 'regular' | 'bold'

/**
 * A constant rendered stroke at every size: 1.5px (1.25px at 14 and below), 2px bold
 * (1.75px at 14 and below), converted to the 24-unit grid.
 */
export const strokeFor = (size: number, weight: IconWeight = 'regular') =>
  ((weight === 'bold' ? (size <= 14 ? 1.75 : 2) : size <= 14 ? 1.25 : 1.5) * 24) / size

// No strokeWidth: the weight comes from size and `weight`, so every glyph matches.
interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'strokeWidth'> {
  name: IconName
  /** On the optical scale only; 22 by default. */
  size?: IconSize
  /** 'bold' for the active tab, a check inside a filled box, the floating +. */
  weight?: IconWeight
}

export function Icon({ name, size = 22, weight = 'regular', ...rest }: IconProps) {
  const fill = FILLS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size, weight)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name] ? <path d={PATHS[name]} /> : null}
      {fill && <path d={fill} fill="currentColor" stroke="none" />}
    </svg>
  )
}
