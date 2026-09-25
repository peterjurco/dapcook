import { describe, expect, it } from 'vitest'
import {
  applyIngredientEdit,
  buildPlanEntries,
  buildSubmitPayload,
  displayQuantity,
  parseItemText,
  toShoppingItem,
  type PlanEntry,
  type PlanIngredient,
  type PlanSlot,
} from './plan-entries'
import type { Ingredient } from '@/types/recipe'

function ingredient(p: Partial<PlanIngredient> = {}): PlanIngredient {
  return { id: 'r1:0', name: 'rice', unit: 'g', quantityPerPortion: 50, checked: false, ...p }
}

describe('displayQuantity', () => {
  it('multiplies the per-portion quantity by portions', () => {
    expect(displayQuantity(50, 4)).toBe(200)
  })

  it('rounds to 3 decimals like scaleIngredients', () => {
    expect(displayQuantity(100 / 3, 3)).toBe(100)
    expect(displayQuantity(1 / 3, 1)).toBe(0.333)
  })

  it('keeps a missing quantity missing', () => {
    expect(displayQuantity(null, 4)).toBeNull()
  })
})

describe('parseItemText', () => {
  it('splits quantity, known unit and name', () => {
    expect(parseItemText('150 g rice', 'g')).toEqual({ quantity: 150, unit: 'g', name: 'rice' })
  })

  it('accepts a unit glued to the number, as formatQtyUnit renders it', () => {
    expect(parseItemText('150g rice', 'g')).toEqual({ quantity: 150, unit: 'g', name: 'rice' })
  })

  it('matches the known unit case-insensitively and keeps its original spelling', () => {
    expect(parseItemText('2 čl salt', 'ČL')).toEqual({ quantity: 2, unit: 'ČL', name: 'salt' })
  })

  it('accepts decimal point and decimal comma', () => {
    expect(parseItemText('1.5 l milk', 'l').quantity).toBe(1.5)
    expect(parseItemText('1,5 l milk', 'l').quantity).toBe(1.5)
  })

  it('does not treat the start of a word as the unit', () => {
    expect(parseItemText('2 garlic cloves', 'g')).toEqual({ quantity: 2, unit: null, name: 'garlic cloves' })
  })

  it('leaves an unknown unit in the name', () => {
    expect(parseItemText('2 kg rice', 'g')).toEqual({ quantity: 2, unit: null, name: 'kg rice' })
  })

  it('returns no quantity when the text has no leading number', () => {
    expect(parseItemText('  some rice ', 'g')).toEqual({ quantity: null, unit: null, name: 'some rice' })
  })

  it('does not treat a fraction as a leading number', () => {
    expect(parseItemText('1/2 cup rice', 'cup')).toEqual({ quantity: null, unit: null, name: '1/2 cup rice' })
  })

  it('parses a quantity with no known unit', () => {
    expect(parseItemText('2 eggs', null)).toEqual({ quantity: 2, unit: null, name: 'eggs' })
  })
})

describe('applyIngredientEdit', () => {
  it('stores the edited quantity per portion', () => {
    const edited = applyIngredientEdit(ingredient(), '150g rice', 4)
    expect(edited).toMatchObject({ name: 'rice', unit: 'g', quantityPerPortion: 37.5 })
    expect(displayQuantity(edited.quantityPerPortion, 6)).toBe(225)
  })

  it('does not drift when portions go 4 → 5 → 4 after an edit', () => {
    const edited = applyIngredientEdit(ingredient(), '150g rice', 4)
    expect(displayQuantity(edited.quantityPerPortion, 5)).toBe(187.5)
    expect(displayQuantity(edited.quantityPerPortion, 4)).toBe(150)
  })

  it('drops the quantity when the edit has no number', () => {
    expect(applyIngredientEdit(ingredient(), 'rice', 4)).toMatchObject({ name: 'rice', unit: null, quantityPerPortion: null })
  })

  it('keeps the previous name when only a quantity is typed', () => {
    expect(applyIngredientEdit(ingredient(), '100g', 2)).toMatchObject({ name: 'rice', unit: 'g', quantityPerPortion: 50 })
  })

  it('keeps the checked flag', () => {
    expect(applyIngredientEdit(ingredient({ checked: true }), '1 g rice', 1).checked).toBe(true)
  })

  it('keeps the stored quantity when the displayed (rounded) value is re-typed unchanged', () => {
    const edited = applyIngredientEdit(ingredient({ unit: 'g', quantityPerPortion: 62.5 }), '188g brown flour', 3)
    expect(edited).toMatchObject({ name: 'brown flour', unit: 'g', quantityPerPortion: 62.5 })
  })

  it('still recomputes when the quantity actually changes', () => {
    const edited = applyIngredientEdit(ingredient({ unit: 'g', quantityPerPortion: 62.5 }), '200g brown flour', 3)
    expect(edited).toMatchObject({ name: 'brown flour', unit: 'g', quantityPerPortion: 200 / 3 })
  })

  it('does not divide by zero when portions is 0', () => {
    expect(applyIngredientEdit(ingredient(), '150g rice', 0)).toMatchObject({ quantityPerPortion: 150 })
  })

  it('keeps a null quantity null when the edit has no leading number', () => {
    const edited = applyIngredientEdit(ingredient({ unit: 'pinch', quantityPerPortion: null }), 'pinch salt', 2)
    expect(edited).toMatchObject({ name: 'pinch salt', unit: null, quantityPerPortion: null })
  })
})

describe('toShoppingItem', () => {
  it('renders the ingredient at the given portions for ShoppingItemRow', () => {
    expect(toShoppingItem(ingredient({ checked: true }), 3, 2)).toEqual({
      id: 'r1:0',
      shopping_list_id: 'plan',
      name: 'rice',
      quantity: 150,
      unit: 'g',
      category: null,
      is_checked: true,
      sort_order: 2,
      source_recipe_ids: [],
    })
  })

  it('renders a null quantity when the ingredient has none', () => {
    expect(toShoppingItem(ingredient({ quantityPerPortion: null }), 3, 0).quantity).toBeNull()
  })
})

function recipeSlot(p: {
  id: string
  day: number
  title: string
  servings: number | null
  ingredients?: unknown
}): PlanSlot {
  return {
    id: `slot-${p.id}-${p.day}`,
    week_plan_id: 'w',
    day_of_week: p.day,
    meal_type: 'lunch',
    recipe_id: p.id,
    custom_label: null,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: {
      id: p.id,
      title: p.title,
      image_url: null,
      cook_time_min: null,
      prep_time_min: null,
      servings: p.servings,
      ingredients: p.ingredients ?? [],
    },
  }
}

function customSlot(p: { id: string; day: number; label: string }): PlanSlot {
  return {
    id: `slot-${p.id}`,
    week_plan_id: 'w',
    day_of_week: p.day,
    meal_type: 'lunch',
    recipe_id: null,
    custom_label: p.label,
    servings_scale: 1,
    span_days: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    recipe: null,
  }
}

const ing = (p: Partial<Ingredient>): Ingredient => ({ id: 'x', quantity: null, unit: '', name: '', notes: '', ...p })
const dayLabel = (slot: PlanSlot) => `D${slot.day_of_week}`

describe('buildPlanEntries', () => {
  it('makes one recipe entry per recipe and collects its days', () => {
    const entries = buildPlanEntries(
      [
        recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: 2 }),
        recipeSlot({ id: 'r1', day: 3, title: 'Pasta', servings: 2 }),
      ],
      dayLabel,
    )
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ kind: 'recipe', key: 'r1', title: 'Pasta', days: ['D1', 'D3'], portions: 2 })
  })

  it('defaults portions to 1 when the recipe has no servings', () => {
    const [entry] = buildPlanEntries([recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: null })], dayLabel)
    expect(entry.portions).toBe(1)
  })

  it('stores ingredient quantities per portion', () => {
    const [entry] = buildPlanEntries(
      [
        recipeSlot({
          id: 'r1',
          day: 1,
          title: 'Pasta',
          servings: 4,
          ingredients: [ing({ quantity: 200, unit: 'g', name: 'pasta' }), ing({ name: 'salt' })],
        }),
      ],
      dayLabel,
    )
    expect(entry.kind === 'recipe' && entry.ingredients).toEqual([
      { id: 'r1:0', name: 'pasta', unit: 'g', quantityPerPortion: 50, checked: false },
      { id: 'r1:1', name: 'salt', unit: null, quantityPerPortion: null, checked: false },
    ])
  })

  it('uses the raw quantity as per-portion when servings is null', () => {
    const [entry] = buildPlanEntries(
      [recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: null, ingredients: [ing({ quantity: 100, unit: 'g', name: 'flour' })] })],
      dayLabel,
    )
    expect(entry.kind === 'recipe' && entry.ingredients[0].quantityPerPortion).toBe(100)
  })

  it('guards against division by zero when servings is 0', () => {
    const [entry] = buildPlanEntries(
      [recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: 0, ingredients: [ing({ quantity: 100, unit: 'g', name: 'flour' })] })],
      dayLabel,
    )
    expect(entry.portions).toBe(1)
    expect(entry.kind === 'recipe' && entry.ingredients[0].quantityPerPortion).toBe(100)
  })

  it('treats non-array ingredients as none', () => {
    const [entry] = buildPlanEntries([recipeSlot({ id: 'r1', day: 1, title: 'Pasta', servings: 2, ingredients: null })], dayLabel)
    expect(entry.kind === 'recipe' && entry.ingredients).toEqual([])
  })

  it('adds typed custom meals once, skips preset labels, keeps recipes first', () => {
    const entries = buildPlanEntries(
      [
        customSlot({ id: 'c1', day: 1, label: 'rice' }),
        customSlot({ id: 'c2', day: 2, label: ' rice ' }),
        customSlot({ id: 'c3', day: 3, label: 'Eating out' }),
        recipeSlot({ id: 'r1', day: 4, title: 'Pasta', servings: 2 }),
      ],
      dayLabel,
    )
    expect(entries.map((e) => e.key)).toEqual(['r1', 'custom:rice'])
    expect(entries[1]).toMatchObject({ kind: 'custom', name: 'rice', days: ['D1', 'D2'], portions: 1 })
  })
})

describe('buildSubmitPayload', () => {
  const recipe: PlanEntry = {
    kind: 'recipe',
    key: 'r1',
    recipeId: 'r1',
    title: 'Pasta',
    servings: 2,
    days: [],
    portions: 3,
    removed: false,
    ingredients: [
      { id: 'r1:0', name: 'pasta', unit: 'g', quantityPerPortion: 100, checked: false },
      { id: 'r1:1', name: 'salt', unit: null, quantityPerPortion: null, checked: false },
      { id: 'r1:2', name: 'oil', unit: 'ml', quantityPerPortion: 10, checked: true },
    ],
  }
  const custom: PlanEntry = { kind: 'custom', key: 'custom:rice', name: 'rice', title: 'rice', days: [], portions: 2, removed: false }

  it('sends scaled unchecked ingredients and custom meals', () => {
    expect(buildSubmitPayload([recipe, custom])).toEqual({
      ingredients: [
        { name: 'pasta', quantity: 300, unit: 'g', recipe_id: 'r1' },
        { name: 'salt', quantity: null, unit: null, recipe_id: 'r1' },
      ],
      customItems: [{ name: 'rice', portions: 2 }],
    })
  })

  it('leaves out removed entries', () => {
    expect(buildSubmitPayload([{ ...recipe, removed: true }, { ...custom, removed: true }])).toEqual({
      ingredients: [],
      customItems: [],
    })
  })
})
