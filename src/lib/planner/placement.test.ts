import { describe, it, expect } from 'vitest'
import { placeInWeek } from './placement'
import { parseDateString } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

function slot(id: string, date: string, span_days = 1): MealSlotWithRecipe {
  return {
    id,
    household_id: 'hh',
    date,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: 'Leftovers',
    servings_scale: 1,
    span_days,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const sundayWeek = parseDateString('2026-09-27')!

describe('placeInWeek', () => {
  it('places a meal inside the week at its day', () => {
    const [p] = placeInWeek([slot('a', '2026-09-29', 2)], sundayWeek)
    expect(p).toMatchObject({ id: 'a', day: 3, span: 2, hiddenBefore: 0, continued: false })
  })

  it('clips a meal that started in the previous week and marks it continued', () => {
    // Saturday 2026-09-26 for 3 days → Sat, Sun, Mon
    const [p] = placeInWeek([slot('a', '2026-09-26', 3)], sundayWeek)
    expect(p).toMatchObject({ day: 1, span: 2, hiddenBefore: 1, continued: true })
  })

  it('clips a meal that runs past the end of the week', () => {
    const [p] = placeInWeek([slot('a', '2026-10-03', 3)], sundayWeek)
    expect(p).toMatchObject({ day: 7, span: 1, hiddenBefore: 0, continued: false })
  })

  it('drops meals that do not touch the week', () => {
    expect(placeInWeek([slot('a', '2026-09-25', 2), slot('b', '2026-10-04')], sundayWeek)).toEqual([])
  })

  it('keeps the original slot fields', () => {
    const [p] = placeInWeek([slot('a', '2026-09-27', 1)], sundayWeek)
    expect(p.date).toBe('2026-09-27')
    expect(p.span_days).toBe(1)
  })
})
