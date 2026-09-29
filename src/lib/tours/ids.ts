/** Every product tour. Stored in profiles.tours_seen once completed or skipped. */
export const TOUR_IDS = [
  'plan-recipe',
  'planner-mobile-view',
  'planner-mobile-edit',
  'planner-desktop',
  'shopping-generate',
  'shopping-list',
] as const

export type TourId = (typeof TOUR_IDS)[number]

export function isTourId(value: unknown): value is TourId {
  return typeof value === 'string' && (TOUR_IDS as readonly string[]).includes(value)
}
