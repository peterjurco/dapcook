import { filterRecipesByTags, type Taxonomy } from '@/lib/tags/taxonomy'
import { normalizeText } from '@/lib/utils/normalize-text'
import type { RecipeListItem } from './list-columns'

/** Inclusive bounds; a `null` side is open. */
export interface Range {
  min: number | null
  max: number | null
}

export interface RangePreset {
  label: string
  range: Range
}

/** Shortest ingredient term worth a server round trip. */
export const MIN_INGREDIENT_TERM = 2

// Lower bounds of the first presets are open rather than 0/1 so a custom
// "to 15" is recognised as the "≤ 15" preset. Adjacent presets never share
// a boundary, so every value falls into exactly one.
export const TIME_PRESETS: readonly RangePreset[] = [
  { label: '≤ 15', range: { min: null, max: 15 } },
  { label: '15–30', range: { min: 16, max: 30 } },
  { label: '30–60', range: { min: 31, max: 60 } },
  { label: '60+', range: { min: 61, max: null } },
]

export const SERVINGS_PRESETS: readonly RangePreset[] = [
  { label: '1–2', range: { min: null, max: 2 } },
  { label: '3–4', range: { min: 3, max: 4 } },
  { label: '5+', range: { min: 5, max: null } },
]

type Timed = Pick<RecipeListItem, 'prep_time_min' | 'cook_time_min'>

/** Prep + cook, a missing half counting as 0; `null` when neither is known. */
export function totalTime(recipe: Timed): number | null {
  if (recipe.prep_time_min == null && recipe.cook_time_min == null) return null
  return (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)
}

/**
 * A recipe with no value never satisfies an active range: asking for "under
 * 30 minutes" should not surface recipes whose time nobody entered.
 */
export function matchesRange(value: number | null, range: Range | null): boolean {
  if (!range || (range.min === null && range.max === null)) return true
  if (value === null) return false
  if (range.min !== null && value < range.min) return false
  if (range.max !== null && value > range.max) return false
  return true
}

export function presetFor(range: Range | null, presets: readonly RangePreset[]): RangePreset | undefined {
  if (!range) return undefined
  return presets.find((p) => p.range.min === range.min && p.range.max === range.max)
}

export interface FilterCriteria {
  tags: string[]
  time: Range | null
  servings: Range | null
  search: string
  /** Recipes matched by the ingredient search; `null` = no ingredient constraint. */
  ingredientIds: ReadonlySet<string> | null
}

export function applyFilters<T extends RecipeListItem>(
  recipes: readonly T[],
  criteria: FilterCriteria,
  taxonomy: Taxonomy
): T[] {
  const q = normalizeText(criteria.search.trim())
  return filterRecipesByTags(recipes, criteria.tags, taxonomy).filter(
    (r) =>
      matchesRange(totalTime(r), criteria.time) &&
      matchesRange(r.servings, criteria.servings) &&
      (criteria.ingredientIds === null || criteria.ingredientIds.has(r.id)) &&
      (q === '' || normalizeText(r.title).includes(q))
  )
}

/** What the user has chosen in the Filters modal, as counted on its badge. */
export interface RecipeFilters {
  tags: string[]
  time: Range | null
  servings: Range | null
  ingredient: string
}

export function activeFilterCount(filters: RecipeFilters): number {
  return (
    filters.tags.length +
    (filters.time ? 1 : 0) +
    (filters.servings ? 1 : 0) +
    (filters.ingredient.trim().length >= MIN_INGREDIENT_TERM ? 1 : 0)
  )
}
