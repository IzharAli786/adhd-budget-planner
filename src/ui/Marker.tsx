import { cx } from './cx'

/** Dated things on Calendar, Coming up and their legends: each kind has its own shape. */
export type MarkerKind = 'bill' | 'debt' | 'payday' | 'logged' | 'note'

interface MarkerProps {
  kind: MarkerKind
  /** A paid bill or debt payment: a full-strength control grey (3:1), not a faded dot. */
  paid?: boolean
  /** On an accent fill (Calendar's today cell): every mark turns accent-contrast. */
  inverse?: boolean
  /** sm in a Calendar cell, md in Coming up and the legends. */
  size?: 'sm' | 'md'
  /** Layout only. */
  className?: string
}

const SHAPE: Record<MarkerKind, Record<'sm' | 'md', string>> = {
  bill: { sm: 'size-1.5 rounded-full', md: 'size-2 rounded-full' },
  debt: { sm: 'size-[5px] rotate-45', md: 'size-[7px] rotate-45' },
  payday: { sm: 'size-1.5 rounded-full border-[1.5px]', md: 'size-2 rounded-full border-[1.75px]' },
  logged: { sm: 'size-[5px] rounded-[1px]', md: 'size-[7px] rounded-[1px]' },
  note: { sm: 'h-[1.5px] w-2 rounded-full', md: 'h-[1.5px] w-2.5 rounded-full' },
}

const COLOR: Record<MarkerKind, string> = {
  bill: 'bg-accent',
  debt: 'bg-(--env-plum)',
  payday: 'border-(--env-sage)',
  logged: 'bg-muted',
  note: 'bg-muted',
}

function colorFor(kind: MarkerKind, paid: boolean, inverse: boolean) {
  if (inverse) return kind === 'payday' ? 'border-accent-contrast' : 'bg-accent-contrast'
  if (paid && (kind === 'bill' || kind === 'debt')) return 'bg-control'
  return COLOR[kind]
}

/**
 * One vocabulary for dated things: a dot is a bill, a diamond a debt payment, a ring a
 * payday, a square something logged, a dash a note. Shape tells them apart where two hues
 * sit close (Sage's accent and payday green). Always aria-hidden: the row says the words.
 */
export function Marker({
  kind,
  paid = false,
  inverse = false,
  size = 'sm',
  className,
}: MarkerProps) {
  return (
    <span
      aria-hidden="true"
      data-marker={kind}
      className={cx(
        'inline-block shrink-0',
        SHAPE[kind][size],
        colorFor(kind, paid, inverse),
        className,
      )}
    />
  )
}
