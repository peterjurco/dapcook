import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { getCurrentProfile, getCurrentUser } from '@/lib/auth/current-user'
import { AppShell } from '@/components/layout/AppShell'
import { PostHogIdentifier } from '@/components/providers/PostHogIdentifier'
import { isLocale, defaultLocale } from '@/i18n/config'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const profile = await getCurrentProfile()
  if (!profile?.household_id) redirect('/onboarding')

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  const birthdayUser = process.env.BIRTHDAY_USER?.toLowerCase()
  const birthdayDate = process.env.BIRTHDAY_DATE
  const birthdayMessage = process.env.BIRTHDAY_MESSAGE
  const birthdayConfig =
    birthdayUser && birthdayDate && birthdayMessage && user.email?.toLowerCase() === birthdayUser
      ? { date: birthdayDate, message: birthdayMessage }
      : undefined

  const locale = isLocale(profile.ui_language) ? profile.ui_language : defaultLocale
  setRequestLocale(locale)
  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {user.email && <PostHogIdentifier userId={user.id} email={user.email} optOut={isAdmin} />}
      <AppShell user={user} profile={profile} isAdmin={isAdmin} birthdayConfig={birthdayConfig}>
        {children}
      </AppShell>
    </NextIntlClientProvider>
  )
}
