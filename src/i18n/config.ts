export const locales = ['en', 'sk'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale)
}

export function toIntlLocale(locale: Locale): string {
  return locale === 'sk' ? 'sk-SK' : 'en-GB'
}
