import type { PostHog } from 'posthog-js'

/** Activation funnel: recipe → planned meal → generated list → shopping. */
export type MilestoneEvent =
  | 'recipe_created'
  | 'meal_planned'
  | 'shopping_list_generated'
  | 'shopping_item_checked'

/**
 * Captures a milestone event and records when the person first reached it
 * (`first_<event>_at`, set once) so activated users can be filtered as a cohort.
 */
export function trackMilestone(
  posthog: Pick<PostHog, 'capture'>,
  event: MilestoneEvent,
  props: Record<string, string | number> = {},
) {
  posthog.capture(event, {
    ...props,
    $set_once: { [`first_${event}_at`]: new Date().toISOString() },
  })
}
