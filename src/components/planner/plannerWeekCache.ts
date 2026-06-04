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
