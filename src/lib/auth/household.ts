import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from './current-user'
import { perRequest } from './per-request'

/** The cache entry holding one user's household. */
export function householdCacheTag(userId: string): string {
  return `household-of:${userId}`
}

/**
 * A user's household almost never changes — most accounts are put in one at
 * sign-up and stay there — yet every API route was asking Postgres for it
 * again on each request, at roughly 40 ms a time from the function region.
 *
 * The lookup uses the service-role client because an `unstable_cache` callback
 * cannot read cookies. That is safe here: `userId` comes from a JWT whose
 * signature was already verified, and only that user's own row is read.
 */
function readHouseholdId(userId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data } = await supabase
        .from('profiles')
        .select('household_id')
        .eq('id', userId)
        .single()
      return data?.household_id ?? null
    },
    ['household-of', userId],
    { tags: [householdCacheTag(userId)], revalidate: 3600 }
  )()
}

/** The household of the signed-in user, or null if they have none. */
export const getCurrentHouseholdId = perRequest(async (): Promise<string | null> => {
  const user = await getCurrentUser()
  if (!user) return null
  return readHouseholdId(user.id)
})

/**
 * Call straight after moving a user into (or out of) a household, so the next
 * request reads the new value instead of a stale one.
 */
export function forgetHouseholdId(userId: string): void {
  revalidateTag(householdCacheTag(userId))
}
