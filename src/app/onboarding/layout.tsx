import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { defaultLocale } from '@/i18n/config'

// This page renders for a Google-authenticated user who hasn't joined or
// created a household yet, so there's no `profiles.household_id` row that
// would let a downstream page read `ui_language` from — the page itself
// (see page.tsx) only calls the createHousehold/joinHousehold server
// actions and never fetches a profile. Absent a stored language choice,
// this route always renders in the default locale.
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages({ locale: defaultLocale })

  return (
    <NextIntlClientProvider locale={defaultLocale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  )
}
