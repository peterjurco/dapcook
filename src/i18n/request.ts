import { getRequestConfig } from 'next-intl/server'
import { defaultLocale, isLocale } from './config'

export default getRequestConfig(async ({ locale }) => {
  const resolved = isLocale(locale) ? locale : defaultLocale

  const namespaces = ['common', 'nav', 'recipes', 'planner', 'shopping', 'settings', 'auth', 'admin', 'errors']

  const messages = Object.fromEntries(
    await Promise.all(
      namespaces.map(async (ns) => [ns, (await import(`../../messages/${resolved}/${ns}.json`)).default])
    )
  )

  return { locale: resolved, messages }
})
