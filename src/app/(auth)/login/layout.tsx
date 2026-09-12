import { Suspense } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import { defaultLocale } from '@/i18n/config'

// No authenticated user exists at this point by definition, so there's no
// `profiles.ui_language` to honor — this route always renders in the
// default locale.
export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages({ locale: defaultLocale })

  return (
    <NextIntlClientProvider locale={defaultLocale} messages={messages}>
      <Suspense>{children}</Suspense>
    </NextIntlClientProvider>
  )
}
