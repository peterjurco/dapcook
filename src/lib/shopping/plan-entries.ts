import type { ShoppingItem } from '@/types/database'
import type { Ingredient } from '@/types/recipe'
import type { MealSlotWithRecipe, SlotRecipe } from '@/types/planner'
import { CUSTOM_LABELS } from '@/types/planner'
import { formatQty } from './format-quantity'

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

/** Meal slot as loaded by /shopping/generate — the recipe join also selects ingredients (raw JSON). */
export interface PlanSlot extends Omit<MealSlotWithRecipe, 'recipe'> {
  recipe: (SlotRecipe & { ingredients: unknown }) | null
}

interface BaseEntry {
  key: string
  title: string
  days: string[]
  portions: number
  removed: boolean
}
export interface RecipePlanEntry extends BaseEntry {
  kind: 'recipe'
  recipeId: string
  servings: number | null
  ingredients: PlanIngredient[]
}
export interface CustomPlanEntry extends BaseEntry {
  kind: 'custom'
  name: string
}
export type PlanEntry = RecipePlanEntry | CustomPlanEntry

/** Body of POST /api/shopping/items/add-from-plan. */
export interface PlanPayload {
  ingredients: { name: string; quantity: number | null; unit: string | null; recipe_id: string }[]
  customItems: { name: string; portions: number }[]
}

const PRESET_LABELS = new Set<string>(CUSTOM_LABELS)

function toPlanIngredients(recipeId: string, raw: unknown, servings: number | null): PlanIngredient[] {
  const ingredients = Array.isArray(raw) ? (raw as Ingredient[]) : []
  return ingredients.map((ing, i) => ({
    id: `${recipeId}:${i}`,
    name: ing.name,
    unit: ing.unit || null,
    quantityPerPortion: ing.quantity != null ? ing.quantity / (servings || 1) : null,
    checked: false,
  }))
}

/**
 * One entry per unique recipe, then one per unique typed custom meal — preset
 * status labels ("Eating out", …) are not shoppable.
 */
export function buildPlanEntries(slots: PlanSlot[], dayLabel: (slot: PlanSlot) => string): PlanEntry[] {
  const recipes = new Map<string, RecipePlanEntry>()
  const customs = new Map<string, CustomPlanEntry>()

  for (const slot of slots) {
    if (slot.recipe_id) {
      const recipe = slot.recipe
      if (!recipe) continue
      let entry = recipes.get(recipe.id)
      if (!entry) {
        entry = {
          kind: 'recipe',
          key: recipe.id,
          recipeId: recipe.id,
          title: recipe.title,
          servings: recipe.servings,
          days: [],
          portions: recipe.servings || 1,
          removed: false,
          ingredients: toPlanIngredients(recipe.id, recipe.ingredients, recipe.servings),
        }
        recipes.set(recipe.id, entry)
      }
      entry.days.push(dayLabel(slot))
      continue
    }

    const label = slot.custom_label?.trim()
    if (!label || PRESET_LABELS.has(label)) continue
    let entry = customs.get(label)
    if (!entry) {
      entry = { kind: 'custom', key: `custom:${label}`, name: label, title: label, days: [], portions: 1, removed: false }
      customs.set(label, entry)
    }
    entry.days.push(dayLabel(slot))
  }

  return [...Array.from(recipes.values()), ...Array.from(customs.values())]
}

export function buildSubmitPayload(entries: PlanEntry[]): PlanPayload {
  const payload: PlanPayload = { ingredients: [], customItems: [] }
  for (const entry of entries) {
    if (entry.removed) continue
    if (entry.kind === 'custom') {
      payload.customItems.push({ name: entry.name, portions: entry.portions })
      continue
    }
    for (const ingredient of entry.ingredients) {
      if (ingredient.checked) continue
      payload.ingredients.push({
        name: ingredient.name,
        quantity: displayQuantity(ingredient.quantityPerPortion, entry.portions),
        unit: ingredient.unit,
        recipe_id: entry.recipeId,
      })
    }
  }
  return payload
}

/** Same rounding as scaleIngredients. */
export function displayQuantity(quantityPerPortion: number | null, portions: number): number | null {
  if (quantityPerPortion == null) return null
  return Number((quantityPerPortion * portions).toFixed(3))
}

const LEADING_NUMBER = /^(\d+(?:[.,]\d+)?)(?![\d/.,])\s*(.*)$/

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
  const displayed = displayQuantity(ingredient.quantityPerPortion, portions)
  // ShoppingItemRow pre-fills the editor with the rounded displayed quantity — if it comes
  // back unchanged (same unit, same rounded number), keep the stored per-portion value
  // instead of recomputing from the rounded-off number, which would drift it.
  const isUnchangedRoundTrip =
    parsed.quantity != null &&
    displayed != null &&
    parsed.unit === ingredient.unit &&
    parsed.quantity === Number(formatQty(displayed))

  return {
    ...ingredient,
    name: parsed.name || ingredient.name,
    unit: parsed.unit,
    quantityPerPortion: isUnchangedRoundTrip
      ? ingredient.quantityPerPortion
      : parsed.quantity == null
        ? null
        : parsed.quantity / (portions || 1),
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
