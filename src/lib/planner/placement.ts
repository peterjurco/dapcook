import { daysBetween, parseDateString } from '@/lib/utils/week'
import type { MealSlotWithRecipe } from '@/types/planner'

/** A meal as drawn in one week: where it sits and how much of it is visible. */
export interface PlacedSlot extends MealSlotWithRecipe {
  /** 1–7 column of the first visible day. */
  day: number
  /** Visible days in this week. */
  span: number
  /** Days of the meal that fall before this week. */
  hiddenBefore: number
  /** The meal began in an earlier week (only possible after a week-start change). */
  continued: boolean
}

/** Places each slot that touches the week starting at `weekStart`; the rest are dropped. */
export function placeInWeek(slots: MealSlotWithRecipe[], weekStart: Date): PlacedSlot[] {
  const placed: PlacedSlot[] = []
  for (const slot of slots) {
    const date = parseDateString(slot.date)
    if (!date) continue
    const first = daysBetween(weekStart, date) // 0-based, may be negative
    const last = first + slot.span_days - 1
    if (last < 0 || first > 6) continue
    const visibleFirst = Math.max(0, first)
    const visibleLast = Math.min(6, last)
    placed.push({
      ...slot,
      day: visibleFirst + 1,
      span: visibleLast - visibleFirst + 1,
      hiddenBefore: visibleFirst - first,
      continued: first < 0,
    })
  }
  return placed
}
