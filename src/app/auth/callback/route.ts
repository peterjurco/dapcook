import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/recipes'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`)
  }

  const supabase = createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`)
  }

  // Upsert profile
  await supabase.from('profiles').upsert(
    {
      id: data.user.id,
      display_name: data.user.user_metadata?.full_name ?? data.user.email ?? null,
      avatar_url: data.user.user_metadata?.avatar_url ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id', ignoreDuplicates: false }
  )

  // Check if user has a household
  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', data.user.id)
    .single()

  if (!profile?.household_id) {
    // Check for a pending invite stored in a cookie (set before OAuth to survive the round-trip)
    const pendingToken = request.cookies.get('pending_invite_token')?.value

    console.log('[auth/callback] no household. pendingToken:', pendingToken ?? '(none)', '| next:', next)
    console.log('[auth/callback] all cookies:', request.cookies.getAll().map(c => c.name))

    if (pendingToken) {
      const { data: householdRows, error: rpcError } = await supabase.rpc('get_household_by_invite_token', {
        token: pendingToken,
      })
      const household = householdRows?.[0] ?? null

      console.log('[auth/callback] rpc result:', { household, rpcError })

      if (household) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ household_id: household.id })
          .eq('id', data.user.id)

        console.log('[auth/callback] profile update error:', updateError)

        const response = NextResponse.redirect(`${origin}/recipes`)
        response.cookies.delete('pending_invite_token')
        return response
      }
    }

    if (!next.startsWith('/join/')) {
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
