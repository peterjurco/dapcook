import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { forgetHouseholdId } from '@/lib/auth/household'

const DEV_EMAIL = 'dev@dapcook.local'

// Never statically cache/optimize this route: it mutates auth state on every hit.
export const dynamic = 'force-dynamic'

/**
 * Local-only sign-in so agents (and people) can use the app without Google
 * OAuth. It mints a magic link with the service-role key and verifies it
 * server-side, so the browser ends up with a genuine Supabase session and RLS
 * behaves exactly as in production. See "Local development" in CLAUDE.md.
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('Not found', { status: 404 })
  }

  const { searchParams, origin } = new URL(request.url)
  const fresh = searchParams.get('fresh') === '1'
  const requested = searchParams.get('next')
  const next =
    requested?.startsWith('/') && !requested.startsWith('//')
      ? requested
      : fresh ? '/onboarding' : '/recipes'

  const admin = createAdminClient()

  const { error: createError } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: 'Dev User' },
  })
  if (createError && createError.code !== 'email_exists') {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: DEV_EMAIL,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    return NextResponse.json({ error: linkError?.message ?? 'No token' }, { status: 500 })
  }

  const supabase = createClient()
  const { data: session, error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  const userId = session?.user?.id
  if (verifyError || !userId) {
    return NextResponse.json({ error: verifyError?.message ?? 'Verification failed' }, { status: 500 })
  }

  await supabase.from('profiles').upsert(
    { id: userId, display_name: 'Dev User', avatar_url: null, updated_at: new Date().toISOString() },
    { onConflict: 'id', ignoreDuplicates: false }
  )

  if (fresh) {
    await admin.from('profiles').update({ household_id: null, ui_language: 'en' }).eq('id', userId)
    forgetHouseholdId(userId)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
