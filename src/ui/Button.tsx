import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/**
 * Seven roles, three sizes (design spec §4.1):
 * - primary: the one main action of a view ("Log it", "Add bill", "Save backup").
 * - secondary: an alternative action at form size ("Choose a backup file").
 * - pill: an outlined navigation pill, size sm with iconEnd="chevron" ("Open calendar").
 * - ghost: a full-padding borderless accent action (dialog "Cancel", "New goal").
 * - text: a compact accent link-button ("See the math", "Today", "Add a date").
 * - quiet: a compact muted action ("Not now", "Rename", first-step "Delete" + trash).
 * - danger: only the confirm step of a destructive action, always with icon="trash".
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'pill'
  | 'ghost'
  | 'text'
  | 'quiet'
  | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

/** The icon size that sits in each button size (Icon's optical scale). */
export const BUTTON_ICON_SIZE = { sm: 16, md: 18, lg: 20 } as const

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  /** Negative inline margin equal to the padding, so the LABEL lines up with text edges. */
  bleed?: boolean
  /** Leading icon, sized for the button. */
  icon?: IconName
  /** Trailing icon (chevron, arrowRight, external). */
  iconEnd?: IconName
}

const BASE =
  'relative inline-flex shrink-0 items-center justify-center rounded-full select-none transition-[filter,background-color,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none'

// sm is 36px to look at; the invisible band above and below makes the target 44px. It
// stays on one line; md and lg may wrap a long label at 150% text instead of overflowing.
const SM_HIT = "whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
const SIZE: Record<ButtonSize, string> = {
  sm: `h-9 min-w-11 gap-1.5 px-3.5 text-sm font-semibold ${SM_HIT}`,
  md: 'min-h-11 min-w-11 gap-2 px-5 text-center text-body font-medium',
  lg: 'min-h-13 min-w-13 gap-2 px-6 text-center text-base font-medium',
}
// 'text' and 'quiet' are link-like: the same sizes with tighter padding (swapped, not added).
const COMPACT_SIZE: Record<ButtonSize, string> = {
  sm: `h-9 min-w-11 gap-1.5 px-2.5 text-sm font-semibold ${SM_HIT}`,
  md: 'min-h-11 min-w-11 gap-2 px-3 text-center text-body font-medium',
  lg: 'min-h-13 min-w-13 gap-2 px-4 text-center text-base font-medium',
}
const BLEED: Record<'normal' | 'compact', Record<ButtonSize, string>> = {
  normal: { sm: '-mx-3.5', md: '-mx-5', lg: '-mx-6' },
  compact: { sm: '-mx-2.5', md: '-mx-3', lg: '-mx-4' },
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-contrast shadow-card hover:brightness-105 active:brightness-95 disabled:bg-tone-neutral-bg disabled:text-muted disabled:shadow-none',
  secondary:
    'bg-surface text-text ring-1 ring-line hover:bg-accent-soft/60 disabled:bg-tone-neutral-bg disabled:text-muted disabled:ring-0',
  pill: 'bg-surface text-text ring-1 ring-line shadow-[0_1px_2px_rgb(0_0_0/0.06)] hover:bg-accent-soft/60 disabled:text-muted',
  ghost: 'text-accent hover:bg-accent-soft/60 disabled:text-muted',
  text: 'text-accent hover:bg-accent-soft/60 disabled:text-muted',
  quiet: 'text-muted hover:bg-accent-soft/60 hover:text-text disabled:opacity-60',
  danger:
    'bg-surface text-tone-attention ring-1 ring-tone-attention-line hover:bg-tone-attention-bg disabled:bg-tone-neutral-bg disabled:text-muted disabled:ring-0',
}

const isCompact = (variant: ButtonVariant) => variant === 'text' || variant === 'quiet'

/**
 * Class string for a button-looking element (a Link, a <label> for a file input).
 * Positional, so every older call (variant, size, block) keeps working.
 */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
  bleed = false,
): string {
  const compact = isCompact(variant)
  return cx(
    BASE,
    (compact ? COMPACT_SIZE : SIZE)[size],
    block && 'w-full',
    bleed && BLEED[compact ? 'compact' : 'normal'][size],
    VARIANT[variant],
  )
}

/**
 * A link inside a sentence. Accent and muted text are only 1.02-1.30:1 apart, so the
 * underline is what says "link", not the colour.
 */
export const textLinkClass =
  'font-medium text-accent underline decoration-accent/40 decoration-1 underline-offset-4 hover:decoration-accent'

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  bleed = false,
  icon,
  iconEnd,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = BUTTON_ICON_SIZE[size]
  return (
    <button
      type={type}
      className={cx(buttonClass(variant, size, block, bleed), className)}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconSize} className="shrink-0" />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={iconSize} className="shrink-0" />}
    </button>
  )
}
