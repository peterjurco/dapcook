'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generateInviteToken } from '@/lib/utils/invite'
import { getOrigin } from './getOrigin'

export async function signInWithGoogle(redirectTo?: string) {
  const supabase = createClient()
  const origin = getOrigin()

  const callbackUrl = redirectTo
    ? `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
    : `${origin}/auth/callback`

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: callbackUrl,
    },
  })

  if (error) {
    redirect('/login?error=oauth_failed')
  }

  redirect(data.url)
}

export async function signInWithGoogleForJoin(token: string) {
  console.log('[signInWithGoogleForJoin] setting cookie for token:', token)
  const cookieStore = cookies()
  cookieStore.set('pending_invite_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  const supabase = createClient()
  const origin = getOrigin()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    redirect('/login?error=oauth_failed')
  }

  redirect(data.url)
}

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function createHousehold(name: string) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const inviteToken = generateInviteToken()
  const householdId = crypto.randomUUID()

  const { error: householdError } = await supabase
    .from('households')
    .insert({ id: householdId, name, invite_token: inviteToken })

  if (householdError) {
    return { error: 'Failed to create household' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: householdId })
    .eq('id', user.id)

  if (profileError) {
    return { error: 'Failed to link household to profile' }
  }

  await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, name: 'Shopping list' })

  redirect('/recipes?ob=1')
}

export async function joinHousehold(inviteToken: string) {
  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/join/${inviteToken}`)

  const { data: householdRows, error: lookupError } = await supabase
    .rpc('get_household_by_invite_token', { token: inviteToken })
  const household = (householdRows as Array<{ id: string; name: string }> | null)?.[0] ?? null

  if (lookupError || !household) {
    return { error: 'Invalid invite code' }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id)

  if (profileError) {
    return { error: 'Failed to join household' }
  }

  redirect('/recipes?ob=1')
}
