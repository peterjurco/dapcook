import { getRequestConfig } from 'next-intl/server'
import { resolveLocale } from './config'

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
