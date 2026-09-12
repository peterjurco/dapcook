import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { isLocale, defaultLocale } from '@/i18n/config'

export default async function FlowLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('ui_language').eq('id', user.id).single()

  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  setRequestLocale(locale)
  const messages = await getMessages({ locale })

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen bg-gray-50">
        {children}
      </div>
    </NextIntlClientProvider>
  )
}
