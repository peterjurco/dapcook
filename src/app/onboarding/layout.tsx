import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { defaultLocale } from '@/i18n/config'

// The profile row already exists at this point (upserted in
// auth/callback), but this layout/page never fetches it, so there's no
// `ui_language` on hand here — this route renders in the default locale
// until that's worth adding.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages({ locale: defaultLocale })

  return (
    <NextIntlClientProvider locale={defaultLocale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
