import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PersistedStep } from './steps'

export interface OnboardingStatus {
  /** Null once onboarding is finished. */
  step: PersistedStep | null
  createdBy: string | null
}

export function onboardingCacheTag(householdId: string): string {
  return `onboarding-of:${householdId}`
}

/**
 * The household's onboarding step and who created it.
 *
 * The `(app)` layout asks on every navigation, so — like `getCurrentHouseholdId`
 * — the answer is cached across requests and invalidated whenever the step
 * changes. Service-role client because cache callbacks cannot read cookies;
 * callers pass a household id that came from a verified session.
 */
export function readOnboardingStatus(householdId: string): Promise<OnboardingStatus> {
  return unstable_cache(
    async (): Promise<OnboardingStatus> => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('households')
        .select('onboarding_step, created_by')
        .eq('id', householdId)
        .single()
      if (error) throw error
      return { step: data?.onboarding_step ?? null, createdBy: data?.created_by ?? null }
    },
    ['onboarding-of', householdId],
    { tags: [onboardingCacheTag(householdId)], revalidate: 3600 }
  )()
}

/** Only the household's creator walks the wizard; members who join mid-way go straight to the app. */
export function needsOnboarding(status: OnboardingStatus, userId: string): boolean {
  return status.step !== null && status.createdBy === userId
}

export function forgetOnboardingStep(householdId: string): void {
  revalidateTag(onboardingCacheTag(householdId))
}
