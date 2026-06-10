import { describe, it, expect } from 'vitest'
import {
  setCachedWeekData,
  getCachedWeekData,
  addSlotToCachedWeek,
  removeSlotFromCachedWeek,
} from './plannerWeekCache'
import type { WeekData, MealSlotWithRecipe } from '@/types/planner'

function slot(id: string, day = 1): MealSlotWithRecipe {
  return {
    id,
    week_plan_id: 'wp',
    day_of_week: day,
    meal_type: 'lunch',
    recipe_id: `r-${id}`,
    custom_label: null,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

function weekData(slots: MealSlotWithRecipe[]): WeekData {
  return {
    weekPlan: {
      id: 'wp',
      household_id: 'h',
      week_start: 'x',
      generated_by: null,
      ai_reasoning: null,
      created_at: 'x',
    },
    slots,
    weekRules: [],
  }
}

describe('plannerWeekCache slot helpers', () => {
  it('appends a slot to an already-cached week', () => {
    setCachedWeekData('w-append', weekData([slot('a')]))
    addSlotToCachedWeek('w-append', slot('b'))
    expect(getCachedWeekData('w-append')!.slots.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('is a no-op when the week is not cached (planner fetches fresh)', () => {
    addSlotToCachedWeek('w-missing', slot('x'))
    expect(getCachedWeekData('w-missing')).toBeNull()
  })

  it('does not duplicate an already-present slot', () => {
    setCachedWeekData('w-dupe', weekData([slot('a')]))
    addSlotToCachedWeek('w-dupe', slot('a'))
    expect(getCachedWeekData('w-dupe')!.slots).toHaveLength(1)
  })

  it('removes a slot from a cached week', () => {
    setCachedWeekData('w-remove', weekData([slot('a'), slot('b')]))
    removeSlotFromCachedWeek('w-remove', 'a')
    expect(getCachedWeekData('w-remove')!.slots.map((s) => s.id)).toEqual(['b'])
  })
})
