import type { ReactNode } from 'react'
import { Icon } from './Icon'

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
        <FieldError id={`${id}-error`}>{error}</FieldError>
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

/**
 * A field's error line: the attention tone, an alert glyph and the words, so it reads as
 * an error without colour. Point the input's aria-describedby at `id`.
 */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm font-medium text-tone-attention">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      {/* Bare text, so getByText(message).id is the id that aria-describedby names. */}
      {children}
    </p>
  )
}

/**
 * Text inputs. The edge is --control-border (3:1 on every surface, like a checkbox's), so
 * a field is findable in dark sheets. The focus ring comes from app.css (attention-coloured
 * when aria-invalid).
 */
export const inputClass =
  'min-h-12 w-full rounded-2xl border border-control bg-surface px-4 text-base text-text outline-none transition-colors placeholder:text-muted focus:border-accent aria-invalid:border-tone-attention'
