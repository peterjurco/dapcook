import type { ShoppingItem } from '@/types/database'

export interface PlanIngredient {
  /** `${recipeId}:${index}` — stable across edits. */
  id: string
  name: string
  unit: string | null
  /** Quantity for one portion; null when the ingredient has no quantity. */
  quantityPerPortion: number | null
  /** Checked = "I already have it" — left out of the list. */
  checked: boolean
}

/** Same rounding as scaleIngredients. */
export function displayQuantity(quantityPerPortion: number | null, portions: number): number | null {
  if (quantityPerPortion == null) return null
  return Number((quantityPerPortion * portions).toFixed(3))
}

const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)\s*(.*)$/

/**
 * ShoppingItemRow saves an edit as free text ("150g rice"). Split it back so the
 * quantity keeps scaling with portions. Only the ingredient's current unit is
 * recognized — anything else after the number stays part of the name.
 */
export function parseItemText(
  text: string,
  knownUnit: string | null,
): { quantity: number | null; unit: string | null; name: string } {
  const trimmed = text.trim()
  const match = trimmed.match(LEADING_NUMBER)
  if (!match) return { quantity: null, unit: null, name: trimmed }

  const quantity = parseFloat(match[1].replace(',', '.'))
  const rest = match[2]
  if (knownUnit) {
    const unitLength = knownUnit.length
    const startsWithUnit = rest.slice(0, unitLength).toLowerCase() === knownUnit.toLowerCase()
    const unitEndsThere = rest.length === unitLength || /\s/.test(rest[unitLength])
    if (startsWithUnit && unitEndsThere) {
      return { quantity, unit: knownUnit, name: rest.slice(unitLength).trim() }
    }
  }
  return { quantity, unit: null, name: rest }
}

export function applyIngredientEdit(ingredient: PlanIngredient, text: string, portions: number): PlanIngredient {
  const parsed = parseItemText(text, ingredient.unit)
  return {
    ...ingredient,
    name: parsed.name || ingredient.name,
    unit: parsed.unit,
    quantityPerPortion: parsed.quantity == null ? null : parsed.quantity / portions,
  }
}

/** Shape ShoppingItemRow renders. */
export function toShoppingItem(ingredient: PlanIngredient, portions: number, index: number): ShoppingItem {
  return {
    id: ingredient.id,
    shopping_list_id: 'plan',
    name: ingredient.name,
    quantity: displayQuantity(ingredient.quantityPerPortion, portions),
    unit: ingredient.unit,
    category: null,
    is_checked: ingredient.checked,
    sort_order: index,
    source_recipe_ids: [],
  }
}
