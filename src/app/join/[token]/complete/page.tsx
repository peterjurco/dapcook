import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function JoinCompletePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/join/${token}`)

  // Look up household via SECURITY DEFINER function
  const { data: householdRows, error } = await supabase.rpc('get_household_by_invite_token', {
    token,
  })
  const household = householdRows?.[0] ?? null

  if (error || !household) redirect('/join-invalid')

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id)

  if (profileError) redirect('/join-invalid')

  redirect('/recipes')
}
