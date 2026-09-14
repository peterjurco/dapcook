import * as React from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

/**
 * `React.cache` only exists in the react-server build Next uses on the server;
 * outside it (unit tests) fall back to calling through uncached.
 */
const perRequest: <T extends () => Promise<unknown>>(fn: T) => T =
  (React as { cache?: <T extends () => Promise<unknown>>(fn: T) => T }).cache ?? ((fn) => fn)

/**
 * Request-scoped accessors for the signed-in user and their profile.
 *
 * Wrapped in React's `cache()` so layouts, pages and `i18n/request.ts` can all
 * ask for the profile without adding Supabase round trips — every caller in a
 * single request shares one result.
 */
export const getCurrentUser = perRequest(async () => {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

export const getCurrentProfile = perRequest(async (): Promise<Profile | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = createClient()
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  return (data as Profile | null) ?? null
})
