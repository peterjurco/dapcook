import { describe, it, expect } from 'vitest'
import { normalizeUnit } from './normalize-unit'

describe('normalizeUnit', () => {
  describe('Slovak/Czech teaspoon spellings → ČL (any language)', () => {
    it.each([
      'ČL',
      'čl',
      'Čl',
      'KL',
      'kl',
      'čajová lyžička',
      'Čajová lyžička',
      'čajové lyžičky',
      'čajových lyžičiek',
      'lyžička',
      'lyžičky',
      'lyžičiek',
      'lžička',
      'lžičky',
      'čajová lžička',
      '  čajová   lyžička  ',
    ])('%s → ČL', (input) => {
      expect(normalizeUnit(input)).toBe('ČL')
    })
  })

  describe('Slovak/Czech tablespoon spellings → PL (any language)', () => {
    it.each([
      'PL',
      'pl',
      'Pl',
      'polievková lyžica',
      'Polievková lyžica',
      'polievkové lyžice',
      'polievkových lyžíc',
      'lyžica',
      'lyžice',
      'lyžíc',
      'lžíce',
      'polévková lžíce',
    ])('%s → PL', (input) => {
      expect(normalizeUnit(input)).toBe('PL')
    })
  })

  describe('English spellings fold only for Slovak/Czech recipes', () => {
    it.each([
      ['tsp', 'ČL'],
      ['tsp.', 'ČL'],
      ['tsps', 'ČL'],
      ['teaspoon', 'ČL'],
      ['Teaspoons', 'ČL'],
      ['tbsp', 'PL'],
      ['tbsp.', 'PL'],
      ['tablespoon', 'PL'],
      ['Tablespoons', 'PL'],
    ])('%s → %s when language is sk', (input, expected) => {
      expect(normalizeUnit(input, 'sk')).toBe(expected)
      expect(normalizeUnit(input, 'cs')).toBe(expected)
    })

    it.each(['tsp', 'teaspoon', 'tbsp', 'tablespoon'])('%s is left alone for other languages', (input) => {
      expect(normalizeUnit(input)).toBe(input)
      expect(normalizeUnit(input, 'en')).toBe(input)
      expect(normalizeUnit(input, 'de')).toBe(input)
      expect(normalizeUnit(input, null)).toBe(input)
    })
  })

  describe('unknown units pass through unchanged', () => {
    // 'cl' without diacritics is centilitres — must NOT become ČL
    it.each(['g', 'kg', 'ml', 'l', 'dl', 'cl', 'ks', 'oz', 'cups', 'šálka', 'hrnčeky', 'strúčik', 'štipka'])(
      '%s stays as-is',
      (input) => {
        expect(normalizeUnit(input)).toBe(input)
        expect(normalizeUnit(input, 'sk')).toBe(input)
      }
    )

    it('does not touch casing of unknown units', () => {
      expect(normalizeUnit('Kg')).toBe('Kg')
    })
  })

  describe('empty and nullish input', () => {
    it.each([
      ['', ''],
      ['   ', '   '],
      [null, ''],
      [undefined, ''],
    ])('%s → %s', (input, expected) => {
      expect(normalizeUnit(input)).toBe(expected)
    })
  })
})
