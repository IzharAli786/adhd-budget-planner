import { useId, useMemo, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { CURRENCY_CODES, currencyDecimals } from '../../domain/currencies'
import { weekStartForLocale } from '../../domain/locale'
import { Field, inputClass } from '../../ui/Field'

// Formats people pick most; the device's own locale is always added on top.
const COMMON_LOCALES = (
  'en-IE en-GB en-US en-AU en-CA en-NZ de-DE de-AT de-CH fr-FR fr-BE es-ES it-IT nl-NL ' +
  'nl-BE pt-PT pl-PL sv-SE da-DK nb-NO fi-FI cs-CZ'
).split(' ')

function displayName(type: 'currency' | 'language', code: string) {
  try {
    return new Intl.DisplayNames('en', { type }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Locale and currency, detected from the device and shown as ONE line (PLAN §5): most
 * people only glance at it. "Change" opens the two pickers in place.
 */
export function LocaleLine() {
  const { settings, update } = useAppSettings()
  const [open, setOpen] = useState(false)
  const currencyId = useId()
  const localeId = useId()

  const locales = useMemo(
    () => [...new Set([settings.locale, ...COMMON_LOCALES])],
    [settings.locale],
  )
  const symbol =
    new Intl.NumberFormat(settings.locale, { style: 'currency', currency: settings.currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? settings.currency

  return (
    <div className="rounded-2xl bg-bg px-4 py-2 ring-1 ring-line">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">
          {displayName('currency', settings.currency)} ({symbol}) ·{' '}
          {displayName('language', settings.locale)}
        </p>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="min-h-11 shrink-0 rounded-full px-2 text-sm font-medium text-accent"
        >
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {open && (
        <div className="grid gap-3 pt-1 pb-3 sm:grid-cols-2">
          <Field id={currencyId} label="Currency">
            <select
              id={currencyId}
              value={settings.currency}
              onChange={(e) =>
                void update({
                  currency: e.target.value,
                  decimals: currencyDecimals(e.target.value),
                })
              }
              className={`${inputClass} appearance-none`}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c} · {displayName('currency', c)}
                </option>
              ))}
            </select>
          </Field>
          <Field id={localeId} label="Number and date format">
            <select
              id={localeId}
              value={settings.locale}
              onChange={(e) =>
                void update({
                  locale: e.target.value,
                  weekStart: weekStartForLocale(e.target.value),
                })
              }
              className={`${inputClass} appearance-none`}
            >
              {locales.map((l) => (
                <option key={l} value={l}>
                  {displayName('language', l)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  )
}
