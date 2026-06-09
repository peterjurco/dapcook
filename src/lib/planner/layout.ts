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

/** Greedy lane assignment for the desktop calendar: returns slotId → lane index (0-based). */
export function packLanes(slots: MealSlotWithRecipe[]): Map<string, number> {
  const sorted = [...slots].sort(compareInDay)
  const laneFreeFrom: number[] = [] // lane → first day (1–8) the lane is free again
  const result = new Map<string, number>()
  for (const s of sorted) {
    const start = s.day_of_week
    const end = s.day_of_week + s.span_days // exclusive
    let lane = laneFreeFrom.findIndex((freeFrom) => freeFrom <= start)
    if (lane === -1) {
      lane = laneFreeFrom.length
      laneFreeFrom.push(end)
    } else {
      laneFreeFrom[lane] = end
    }
    result.set(s.id, lane)
  }
  return result
}

export interface AgendaCard {
  slot: MealSlotWithRecipe
  dayIndex: number // 1-based position within the meal's span
  span: number
}
export interface AgendaDay {
  dayOfWeek: number // 1–7
  cards: AgendaCard[]
}

/** For mobile View: each weekday lists every meal active that day (multi-day meals repeat). */
export function buildMobileAgenda(slots: MealSlotWithRecipe[]): AgendaDay[] {
  const days: AgendaDay[] = []
  for (let d = 1; d <= 7; d++) {
    const active = slots
      .filter((s) => s.day_of_week <= d && d < s.day_of_week + s.span_days)
      .sort(compareInDay)
    days.push({
      dayOfWeek: d,
      cards: active.map((s) => ({ slot: s, dayIndex: d - s.day_of_week + 1, span: s.span_days })),
    })
  }
  return days
}
