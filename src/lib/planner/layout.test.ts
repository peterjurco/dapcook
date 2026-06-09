import { describe, it, expect } from 'vitest'
import { compareInDay, buildEditDays, maxSpanForStart } from './layout'
import type { MealSlotWithRecipe } from '@/types/planner'

function slot(
  p: Partial<MealSlotWithRecipe> & { id: string; day_of_week: number; span_days: number },
): MealSlotWithRecipe {
  return {
    id: p.id,
    week_plan_id: 'w',
    day_of_week: p.day_of_week,
    meal_type: 'lunch',
    recipe_id: p.recipe_id ?? null,
    custom_label: p.custom_label ?? null,
    servings_scale: 1,
    span_days: p.span_days,
    recipe: p.recipe ?? null,
  }
}

describe('compareInDay', () => {
  it('orders by start day, then longer span first, then id', () => {
    const a = slot({ id: 'a', day_of_week: 3, span_days: 1 })
    const b = slot({ id: 'b', day_of_week: 2, span_days: 1 })
    const c = slot({ id: 'c', day_of_week: 2, span_days: 3 })
    const d = slot({ id: 'd', day_of_week: 2, span_days: 3 })
    const sorted = [a, b, c, d].sort(compareInDay).map((s) => s.id)
    expect(sorted).toEqual(['c', 'd', 'b', 'a'])
  })
})

describe('maxSpanForStart', () => {
  it('clamps span to the remaining days in the week', () => {
    expect(maxSpanForStart(1)).toBe(7)
    expect(maxSpanForStart(5)).toBe(3)
    expect(maxSpanForStart(7)).toBe(1)
  })
})

describe('buildEditDays', () => {
  it('returns 7 days, each with meals starting that day, ordered', () => {
    const s1 = slot({ id: 's1', day_of_week: 2, span_days: 4 })
    const s2 = slot({ id: 's2', day_of_week: 2, span_days: 1 })
    const s3 = slot({ id: 's3', day_of_week: 4, span_days: 1 })
    const days = buildEditDays([s3, s2, s1])
    expect(days).toHaveLength(7)
    expect(days[1].dayOfWeek).toBe(2)
    expect(days[1].slots.map((s) => s.id)).toEqual(['s1', 's2']) // span 4 before span 1
    expect(days[3].slots.map((s) => s.id)).toEqual(['s3'])
    expect(days[0].slots).toEqual([])
  })
})
