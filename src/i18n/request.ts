import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale, type Locale } from './config'

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

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const resolved = resolveLocale(locale, await requestLocale)

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
