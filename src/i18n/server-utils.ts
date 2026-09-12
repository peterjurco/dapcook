import { getTranslations } from 'next-intl/server'
import { defaultLocale, isLocale, type Locale } from './config'

/**
 * Resolves a user's translations from their profile's `ui_language`, falling
 * back to `defaultLocale` when the profile or its language is missing/invalid.
 *
 * Kept out of `config.ts` because that module is imported by client
 * components (e.g. `InterfaceLanguageSelector`), and `next-intl/server`
 * pulls in server-only APIs that must not leak into the client bundle.
 */
export async function getUserTranslations(
  profile: { ui_language?: string | null } | null | undefined,
  namespace: string
) {
  const locale: Locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  return getTranslations({ locale, namespace })
}
