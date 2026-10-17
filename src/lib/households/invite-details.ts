import { perRequest } from '@/lib/auth/per-request'
import { createClient } from '@/lib/supabase/server'

/** Household name and members behind an invite token, or null when it's invalid. */
export const getInviteDetails = perRequest(async (token: string) => {
  const { data } = await createClient().rpc('get_household_invite_details', { token })
  return data?.[0] ?? null
})
