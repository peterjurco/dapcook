import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/AppShell'
import { PostHogIdentifier } from '@/components/providers/PostHogIdentifier'
import type { Profile } from '@/types/database'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single() as { data: Profile | null; error: unknown }

  if (!profile?.household_id) redirect('/onboarding')

  const isAdmin = user.email === process.env.ADMIN_EMAIL

  const birthdayUser = process.env.BIRTHDAY_USER?.toLowerCase()
  const birthdayDate = process.env.BIRTHDAY_DATE
  const birthdayMessage = process.env.BIRTHDAY_MESSAGE
  const birthdayConfig =
    birthdayUser && birthdayDate && birthdayMessage && user.email?.toLowerCase() === birthdayUser
      ? { date: birthdayDate, message: birthdayMessage }
      : undefined

  return (
    <>
      {user.email && <PostHogIdentifier userId={user.id} email={user.email} optOut={isAdmin} />}
      <AppShell user={user} profile={profile} isAdmin={isAdmin} birthdayConfig={birthdayConfig}>
        {children}
      </AppShell>
    </>
  )
}
