import { describe, it, expect } from 'vitest'
import { scaleIngredients } from './scale-ingredients'

describe('scaleIngredients', () => {
  it('doubles quantities when portions is 2x recipe servings', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 100, unit: 'g', name: 'flour', notes: '' }],
      4,
      2
    )
    expect(result[0].quantity).toBe(200)
  })

  it('uses portions directly as scale when recipe has no servings', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 100, unit: 'g', name: 'flour', notes: '' }],
      3,
      null
    )
    expect(result[0].quantity).toBe(300)
  })

  it('preserves null quantity', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: null, unit: '', name: 'salt', notes: '' }],
      2,
      1
    )
    expect(result[0].quantity).toBeNull()
  })

  it('rounds to 3 decimal places', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 100, unit: 'g', name: 'flour', notes: '' }],
      1,
      3
    )
    expect(result[0].quantity).toBe(33.333)
  })

  it('maps unit to null when empty string', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 2, unit: '', name: 'eggs', notes: '' }],
      1,
      1
    )
    expect(result[0].unit).toBeNull()
  })

  it('preserves unit when non-empty', () => {
    const result = scaleIngredients(
      [{ id: '1', quantity: 200, unit: 'ml', name: 'milk', notes: '' }],
      1,
      1
    )
    expect(result[0].unit).toBe('ml')
  })
})
