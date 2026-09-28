import { describe, it, expect } from 'vitest'
import { unitSystemOf, needsUnitConversion } from './unit-system'

const ing = (unit: string) => ({ id: unit, quantity: 1, unit, name: 'x', notes: '' })

describe('unitSystemOf', () => {
  it.each(['g', 'G', 'g.', 'gr', 'grams', 'kg', 'dkg', 'dag', 'mg', 'ml', 'cl', 'dl', 'l', 'L', 'liter', 'litre', 'cm', 'mm'])(
    '%s is metric',
    (unit) => expect(unitSystemOf(unit)).toBe('metric')
  )

  it.each(['oz', 'ounces', 'lb', 'lbs', 'pound', 'fl oz', 'fl. oz', 'cup', 'cups', 'pint', 'pt', 'quart', 'qt', 'gallon', 'stick', 'inch', 'in'])(
    '%s is imperial',
    (unit) => expect(unitSystemOf(unit)).toBe('imperial')
  )

  it.each(['', 'ČL', 'PL', 'tsp', 'tbsp', 'ks', 'pcs', 'štipka', 'pinch', 'hrnček', 'šálka', 'strúčik', 'bunch'])(
    '%j is neutral',
    (unit) => expect(unitSystemOf(unit)).toBe('neutral')
  )
})

describe('needsUnitConversion', () => {
  it('is false when every unit already matches the target system', () => {
    expect(needsUnitConversion([ing('g'), ing('ml'), ing('ČL'), ing('ks')], 'metric')).toBe(false)
    expect(needsUnitConversion([ing('oz'), ing('cup'), ing('tsp')], 'imperial')).toBe(false)
  })

  it('is false when only neutral units are present', () => {
    expect(needsUnitConversion([ing(''), ing('PL'), ing('pinch')], 'metric')).toBe(false)
  })

  it('is true when any unit belongs to the other system', () => {
    expect(needsUnitConversion([ing('g'), ing('cup')], 'metric')).toBe(true)
    expect(needsUnitConversion([ing('oz'), ing('g')], 'imperial')).toBe(true)
  })

  it('is false without a target system', () => {
    expect(needsUnitConversion([ing('cup')], null)).toBe(false)
  })
})
