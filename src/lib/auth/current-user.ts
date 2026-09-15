import { createClient } from '@/lib/supabase/server'
import { perRequest } from './per-request'
import type { Profile } from '@/types/database'

/** The parts of the signed-in user the app actually reads. */
export interface CurrentUser {
  id: string
  email: string | null
}

/**
 * Request-scoped accessors for the signed-in user and their profile.
 *
 * Wrapped in React's `cache()` so layouts, pages and `i18n/request.ts` can all
 * ask for the profile without adding Supabase round trips — every caller in a
 * single request shares one result.
 *
 * Never use `auth.getSession()` here: it decodes the cookie without checking
 * the signature, so a forged cookie would pass. `auth.getClaims()` is the safe
 * *and* fast option — the project signs tokens with an asymmetric key (ES256),
 * so it verifies the signature locally with WebCrypto against a JWKS that
 * auth-js caches process-wide. `auth.getUser()` is equally safe but pays a
 * round trip to the auth server on every single call.
 */
export const getCurrentUser = perRequest(async (): Promise<CurrentUser | null> => {
  const supabase = createClient()
  const { data } = await supabase.auth.getClaims()

  const claims = data?.claims
  if (!claims?.sub) return null

  return { id: claims.sub, email: claims.email ?? null }
})

export const getCurrentProfile = perRequest(async (): Promise<Profile | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return (data as Profile | null) ?? null
})
