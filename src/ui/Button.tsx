import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'md' | 'lg'
  block?: boolean
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast shadow-card hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface text-text ring-1 ring-line hover:bg-accent-soft/60',
  ghost: 'text-accent hover:bg-accent-soft/60',
  danger: 'bg-danger-soft text-text ring-1 ring-line hover:brightness-95',
}

/** min-h-11 (44px) everywhere: Apple's minimum comfortable tap target (PLAN §8). */
export const buttonClass = (
  variant: ButtonVariant = 'primary',
  size: 'md' | 'lg' = 'md',
  block = false,
) =>
  cx(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full font-medium',
    'transition-[filter,background-color,transform] select-none active:scale-[0.98]',
    'disabled:pointer-events-none disabled:opacity-50',
    size === 'lg' ? 'min-h-13 px-6 text-base' : 'px-5 text-body',
    block && 'w-full',
    VARIANTS[variant],
  )

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClass(variant, size, block), className)} {...rest} />
  )
}
