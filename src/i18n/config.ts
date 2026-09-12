export const locales = ['en', 'sk'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale)
}

export function toIntlLocale(locale: Locale): string {
  return locale === 'sk' ? 'sk-SK' : 'en-GB'
}

/**
 * Resolves the locale for the current request.
 *
 * `locale` is only set when a caller passes an explicit override (e.g.
 * `getMessages({ locale: 'sk' })`). Otherwise we fall back to the ambient
 * `requestLocale`, which is populated by `setRequestLocale()` calls upstream
 * in the same request (see `app/(app)/layout.tsx`). This lets parameterless
 * calls like `getTranslations('namespace')` resolve to the user's actual
 * locale instead of always falling back to `defaultLocale`.
 */
export function resolveLocale(locale: string | undefined, requestLocale: string | undefined): Locale {
  const requested = locale ?? requestLocale
  return isLocale(requested) ? requested : defaultLocale
}
