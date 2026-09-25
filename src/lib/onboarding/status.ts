import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PersistedStep } from './steps'

export function onboardingCacheTag(householdId: string): string {
  return `onboarding-of:${householdId}`
}

/**
 * The household's current onboarding step, or null once it is finished.
 *
 * The `(app)` layout asks on every navigation, so — like `getCurrentHouseholdId`
 * — the answer is cached across requests and invalidated whenever the step
 * changes. Service-role client because cache callbacks cannot read cookies;
 * callers pass a household id that came from a verified session.
 */
export function readOnboardingStep(householdId: string): Promise<PersistedStep | null> {
  return unstable_cache(
    async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('households')
        .select('onboarding_step')
        .eq('id', householdId)
        .single()
      if (error) throw error
      return data?.onboarding_step ?? null
    },
    ['onboarding-of', householdId],
    { tags: [onboardingCacheTag(householdId)], revalidate: 3600 }
  )()
}

export function forgetOnboardingStep(householdId: string): void {
  revalidateTag(onboardingCacheTag(householdId))
}
