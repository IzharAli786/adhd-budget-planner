import type { ReactNode } from 'react'

/** Label + control + hint/error, wired with ids so screen readers read them together. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm font-medium text-accent">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-sm text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export const inputClass =
  'min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base text-text outline-none transition-colors placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20 aria-invalid:border-accent'
