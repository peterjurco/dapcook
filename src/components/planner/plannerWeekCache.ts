import type { MealSlotWithRecipe, WeekData } from '@/types/planner'
import type { WeekPlan } from '@/types/database'

const plannerWeekCache = new Map<string, WeekData>()

export function getCachedWeekData(weekStart: string): WeekData | null {
  return plannerWeekCache.get(weekStart) ?? null
}

export function setCachedWeekData(weekStart: string, data: WeekData) {
  plannerWeekCache.set(weekStart, data)
}

export function updateCachedWeekSlots(
  weekStart: string,
  weekPlan: WeekPlan | null,
  update: (slots: MealSlotWithRecipe[]) => MealSlotWithRecipe[],
) {
  const cached = plannerWeekCache.get(weekStart)
  if (cached) {
    plannerWeekCache.set(weekStart, { ...cached, slots: update(cached.slots) })
  } else if (weekPlan) {
    plannerWeekCache.set(weekStart, { weekPlan, slots: update([]), weekRules: [] })
  }
}

/**
 * Append a freshly-created slot to an already-cached week so the planner shows it
 * immediately on navigation (e.g. "View plan" after Add to Plan). No-op when the
 * week was never cached — the planner fetches it fresh on mount in that case.
 */
export function addSlotToCachedWeek(weekStart: string, slot: MealSlotWithRecipe) {
  const cached = plannerWeekCache.get(weekStart)
  if (!cached || cached.slots.some((s) => s.id === slot.id)) return
  plannerWeekCache.set(weekStart, { ...cached, slots: [...cached.slots, slot] })
}

/** Drop a slot from a cached week (e.g. when "Change" moves a just-placed meal). */
export function removeSlotFromCachedWeek(weekStart: string, slotId: string) {
  const cached = plannerWeekCache.get(weekStart)
  if (!cached) return
  plannerWeekCache.set(weekStart, { ...cached, slots: cached.slots.filter((s) => s.id !== slotId) })
}
