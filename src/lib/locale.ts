import { localeDefaults } from '../domain/locale'

/** Locale, currency and week start guessed from the device, for a fresh install. */
export const detectLocaleDefaults = () => localeDefaults(globalThis.navigator?.language)
