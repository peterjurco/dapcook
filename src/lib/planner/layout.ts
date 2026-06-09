import type { MealSlotWithRecipe } from '@/types/planner'

/** Deterministic within-day order: earliest start, then longest span, then id (stable). */
export function compareInDay(a: MealSlotWithRecipe, b: MealSlotWithRecipe): number {
  if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week
  if (a.span_days !== b.span_days) return b.span_days - a.span_days
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Largest span a meal starting on `startDay` (1–7) can have without leaving the week. */
export function maxSpanForStart(startDay: number): number {
  return 8 - startDay
}

export interface EditDay {
  dayOfWeek: number // 1–7
  slots: MealSlotWithRecipe[] // meals STARTING this day, ordered
}

/** One entry per weekday; each lists the meals whose start day is that day. */
export function buildEditDays(slots: MealSlotWithRecipe[]): EditDay[] {
  const days: EditDay[] = []
  for (let d = 1; d <= 7; d++) {
    days.push({
      dayOfWeek: d,
      slots: slots.filter((s) => s.day_of_week === d).sort(compareInDay),
    })
  }
  return days
}
