import { getRequestConfig } from 'next-intl/server'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { defaultLocale, isLocale, type Locale } from './config'

/**
 * Resolves the locale for a server-side translation call.
 *
 * An explicit `locale` argument wins, then the ambient `requestLocale` set by
 * `setRequestLocale()` in a layout. Neither is guaranteed to be there: Next
 * renders layouts and pages in parallel, so a page calling `getTranslations()`
 * often runs before the layout has set the locale. In that case we read the
 * user's `ui_language` from their profile directly — the same source the
 * layouts use, deduplicated per request by `getCurrentProfile()`.
 */
export async function resolveRequestLocale(
  locale: string | undefined,
  requestLocale: string | undefined
): Promise<Locale> {
  const requested = locale ?? requestLocale
  if (isLocale(requested)) return requested

  const profile = await getCurrentProfile()
  return isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
}

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolved = await resolveRequestLocale(locale, await requestLocale)

  const [common, nav, recipes, planner, shopping, settings, auth, admin, errors] = await Promise.all([
    import(`../../messages/${resolved}/common.json`),
    import(`../../messages/${resolved}/nav.json`),
    import(`../../messages/${resolved}/recipes.json`),
    import(`../../messages/${resolved}/planner.json`),
    import(`../../messages/${resolved}/shopping.json`),
    import(`../../messages/${resolved}/settings.json`),
    import(`../../messages/${resolved}/auth.json`),
    import(`../../messages/${resolved}/admin.json`),
    import(`../../messages/${resolved}/errors.json`),
  ])

  return {
    locale: resolved,
    messages: {
      common: common.default,
      nav: nav.default,
      recipes: recipes.default,
      planner: planner.default,
      shopping: shopping.default,
      settings: settings.default,
      auth: auth.default,
      admin: admin.default,
      errors: errors.default,
    },
  }
})
