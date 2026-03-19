import type { MealSlot, WeekPlan, WeekPlanRule, PlannerRule } from './database'

export interface SlotRecipe {
  id: string
  title: string
  image_url: string | null
  cook_time_min: number | null
  prep_time_min: number | null
}

export interface MealSlotWithRecipe extends MealSlot {
  recipe: SlotRecipe | null
}

export interface WeekData {
  weekPlan: WeekPlan
  slots: MealSlotWithRecipe[]
  weekRules: WeekPlanRule[]
}

export { PlannerRule }

export const CUSTOM_LABELS = ['Leftovers', 'Eating out', 'Takeaway', 'Fasting'] as const

export const RULE_TYPES = [
  { value: 'no_repeat', label: 'No repeat' },
  { value: 'max_per_week', label: 'Limit by category' },
  { value: 'use_ingredient', label: 'Use ingredient' },
  { value: 'custom', label: 'Custom' },
] as const
