'use server'

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { generateInviteToken, extractInviteToken } from '@/lib/utils/invite'
import { getUserTranslations } from '@/i18n/server-utils'
import { getOrigin } from './getOrigin'
import { getCurrentUser } from '@/lib/auth/current-user'
import { forgetHouseholdId } from './household'
import { DEFAULT_SHOPPING_CATEGORIES } from '@/lib/onboarding/defaults'
import { defaultLocale, isLocale } from '@/i18n/config'

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

  const user = await getCurrentUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('ui_language').eq('id', user.id).single()
  const t = await getUserTranslations(profile, 'errors')

  const trimmedName = name.trim()
  if (!trimmedName) return { error: t('createHouseholdFailed') }

  const inviteToken = generateInviteToken()
  const householdId = crypto.randomUUID()

  const { error: householdError } = await supabase
    .from('households')
    .insert({ id: householdId, name: trimmedName, invite_token: inviteToken, onboarding_step: 'translation' })

  if (householdError) {
    return { error: t('createHouseholdFailed') }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: householdId })
    .eq('id', user.id)

  if (profileError) {
    return { error: t('linkHouseholdFailed') }
  }

  forgetHouseholdId(user.id)

  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  const [shoppingListResult, categoriesResult] = await Promise.all([
    supabase.from('shopping_lists').insert({ household_id: householdId, name: 'Shopping list' }),
    supabase.from('shopping_categories').insert(
      DEFAULT_SHOPPING_CATEGORIES.map((category, index) => ({
        household_id: householdId,
        name: category[locale],
        sort_order: index,
      }))
    ),
  ])
  if (shoppingListResult.error || categoriesResult.error) {
    console.error('[createHousehold] seeding failed', {
      shoppingList: shoppingListResult.error,
      categories: categoriesResult.error,
    })
  }

  redirect('/onboarding')
}

export async function joinHousehold(invite: string) {
  const supabase = createClient()

  const user = await getCurrentUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('ui_language').eq('id', user.id).single()
  const t = await getUserTranslations(profile, 'errors')

  const inviteToken = extractInviteToken(invite)
  if (!inviteToken) return { error: t('invalidInviteCode') }

  const { data: householdRows, error: lookupError } = await supabase
    .rpc('get_household_by_invite_token', { token: inviteToken })
  const household = (householdRows as Array<{ id: string; name: string }> | null)?.[0] ?? null

  if (lookupError || !household) {
    return { error: t('invalidInviteCode') }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ household_id: household.id })
    .eq('id', user.id)

  if (profileError) {
    return { error: t('joinHouseholdFailed') }
  }

  forgetHouseholdId(user.id)

  redirect('/recipes?ob=1&obm=join')
}
