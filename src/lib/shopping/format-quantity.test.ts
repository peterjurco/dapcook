import { describe, it, expect } from 'vitest'
import { formatQtyUnit } from './format-quantity'

describe('formatQtyUnit', () => {
  describe('abbreviations — no space', () => {
    it.each([
      [200, 'g', '200g'],
      [1.5, 'kg', '1.5kg'],
      [250, 'ml', '250ml'],
      [1, 'l', '1l'],
      [2, 'dl', '2dl'],
      [3, 'oz', '3oz'],
      [1, 'lb', '1lb'],
      [2, 'tsp', '2tsp'],
      [1, 'tbsp', '1tbsp'],
      [2, 'PL', '2PL'],
      [1, 'ČL', '1ČL'],
    ])('%s %s → %s', (qty, unit, expected) => {
      expect(formatQtyUnit(qty, unit)).toBe(expected)
    })
  })

  describe('words — space between quantity and unit', () => {
    it.each([
      [2, 'cups', '2 cups'],
      [1, 'cup', '1 cup'],
      [3, 'pints', '3 pints'],
      [4, 'hrnčeky', '4 hrnčeky'],
      [2, 'lyžice', '2 lyžice'],
      [3, 'stonky', '3 stonky'],
      [1, 'clove', '1 clove'],
      [2, 'slices', '2 slices'],
      [1, 'bunch', '1 bunch'],
    ])('%s %s → %s', (qty, unit, expected) => {
      expect(formatQtyUnit(qty, unit)).toBe(expected)
    })
  })

  describe('no unit', () => {
    it('returns only the formatted quantity when unit is empty string', () => {
      expect(formatQtyUnit(3, '')).toBe('3')
    })
  })

  describe('decimal quantities', () => {
    it('formats to 3 significant digits', () => {
      expect(formatQtyUnit(1.333333, 'g')).toBe('1.33g')
    })

    it('keeps integers without decimal point', () => {
      expect(formatQtyUnit(2, 'cups')).toBe('2 cups')
    })
  })
})
