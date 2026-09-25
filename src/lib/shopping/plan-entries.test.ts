import { describe, expect, it } from 'vitest'
import {
  applyIngredientEdit,
  displayQuantity,
  parseItemText,
  toShoppingItem,
  type PlanIngredient,
} from './plan-entries'

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
})
