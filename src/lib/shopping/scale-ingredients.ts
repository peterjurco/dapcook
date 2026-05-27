import type { Ingredient } from '@/types/recipe'

export interface ScaledItem {
  name: string
  quantity: number | null
  unit: string | null
}

/**
 * Scale a recipe's ingredients to a target number of portions.
 * When recipeServings is null, portions is used directly as the multiplier.
 */
export function scaleIngredients(
  ingredients: Ingredient[],
  portions: number,
  recipeServings: number | null
): ScaledItem[] {
  const scale = portions / (recipeServings ?? 1)
  return ingredients.map((ing) => ({
    name: ing.name,
    quantity: ing.quantity != null ? Number((ing.quantity * scale).toFixed(3)) : null,
    unit: ing.unit || null,
  }))
}
