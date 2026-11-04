import { useId, useMemo, useState } from 'react'
import { useAppSettings } from '../../app/SettingsProvider'
import { CURRENCY_CODES, currencyDecimals } from '../../domain/currencies'
import { currencySymbol, displayNames } from '../../domain/intl'
import { weekStartForLocale } from '../../domain/locale'
import { Button } from '../../ui/Button'
import { Field, inputClass } from '../../ui/Field'

// Formats people pick most; the device's own locale is always added on top.
const COMMON_LOCALES = (
  'en-IE en-GB en-US en-AU en-CA en-NZ de-DE de-AT de-CH fr-FR fr-BE es-ES it-IT nl-NL ' +
  'nl-BE pt-PT pl-PL sv-SE da-DK nb-NO fi-FI cs-CZ'
).split(' ')

export function displayName(type: 'currency' | 'language', code: string) {
  try {
    return displayNames('en', { type }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Locale and currency, detected from the device and shown as ONE line (PLAN §5): most
 * people only glance at it. "Change" opens the two pickers in place.
 */
export function LocaleLine() {
  const { settings } = useAppSettings()
  const [open, setOpen] = useState(false)
  const symbol = currencySymbol(settings.locale, settings.currency)

  return (
    <div className="rounded-2xl bg-bg px-4 py-2 ring-1 ring-line">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted">
          {displayName('currency', settings.currency)} ({symbol}) ·{' '}
          {displayName('language', settings.locale)}
        </p>
        <Button
          variant="text"
          size="sm"
          bleed
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Done' : 'Change'}
        </Button>
      </div>
      {open && (
        <div className="pt-1 pb-3">
          <LocalePickers />
        </div>
      )}
    </div>
  )
}

/**
 * Currency and number/date format pickers, shared by setup and Settings. A new format
 * also moves the week start to that region's (Intl week data, with a fallback table);
 * Settings lets people override it right after.
 *
 * `sameDecimalsOnly`: once amounts are stored, a currency with other decimals would
 * rescale every number (1250 cents is €12.50 but ¥1,250), so Settings offers only
 * currencies that keep the stored amounts meaning the same.
 */
export function LocalePickers({ sameDecimalsOnly = false }: { sameDecimalsOnly?: boolean }) {
  const { settings, update } = useAppSettings()
  const currencyId = useId()
  const localeId = useId()

  const locales = useMemo(
    () => [...new Set([settings.locale, ...COMMON_LOCALES])],
    [settings.locale],
  )
  const currencies = sameDecimalsOnly
    ? CURRENCY_CODES.filter((c) => currencyDecimals(c) === settings.decimals)
    : CURRENCY_CODES

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field
        id={currencyId}
        label="Currency"
        hint={
          sameDecimalsOnly
            ? 'Only currencies with the same decimals, so no amount changes value.'
            : undefined
        }
      >
        <select
          id={currencyId}
          aria-describedby={sameDecimalsOnly ? `${currencyId}-hint` : undefined}
          value={settings.currency}
          onChange={(e) =>
            void update({
              currency: e.target.value,
              decimals: currencyDecimals(e.target.value),
            })
          }
          className={`${inputClass} appearance-none`}
        >
          {currencies.map((c) => (
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
  )
}
