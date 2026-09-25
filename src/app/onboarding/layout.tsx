import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { defaultLocale, isLocale } from '@/i18n/config'
import { getCurrentProfile, getCurrentUser } from '@/lib/auth/current-user'
import { PostHogIdentifier } from '@/components/providers/PostHogIdentifier'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // The profile row exists by now (upserted in auth/callback); the language step
  // writes `ui_language` and refreshes, so later steps render in that language.
  const profile = await getCurrentProfile()
  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  setRequestLocale(locale)
  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {user.email && (
        <PostHogIdentifier userId={user.id} email={user.email} optOut={user.email === process.env.ADMIN_EMAIL} />
      )}
      {children}
    </NextIntlClientProvider>
  )
}
