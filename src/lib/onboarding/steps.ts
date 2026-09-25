export const ONBOARDING_STEPS = [
  'language',
  'intro',
  'household',
  'translation',
  'units',
  'tags',
  'shopping_categories',
  'shopping_rules',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Steps that exist once the household does, stored in `households.onboarding_step`. */
export const PERSISTED_STEPS = ['translation', 'units', 'tags', 'shopping_categories', 'shopping_rules'] as const

export type PersistedStep = (typeof PERSISTED_STEPS)[number]

/** Shown as "Step n of TOTAL_STEPS"; the language step comes before counting starts. */
export const TOTAL_STEPS = ONBOARDING_STEPS.length - 1

export function isPersistedStep(value: unknown): value is PersistedStep {
  return PERSISTED_STEPS.includes(value as PersistedStep)
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step)
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]
}

/** What `onboarding_step` becomes once `step` is done — null means onboarding is finished. */
export function persistedStepAfter(step: PersistedStep): PersistedStep | null {
  return PERSISTED_STEPS[PERSISTED_STEPS.indexOf(step) + 1] ?? null
}

export function stepNumber(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step)
}
