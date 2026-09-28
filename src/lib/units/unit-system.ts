import type { Ingredient } from '@/types/recipe'

export type UnitSystem = 'metric' | 'imperial'

/**
 * Units that belong to one measurement system. Anything else — spoons, pieces,
 * pinches, Slovak "hrnček"/"šálka", empty units — is neutral: converting it would
 * be guesswork, so it never triggers an AI conversion on its own.
 */
const METRIC = new Set([
  'g', 'gr', 'gram', 'grams', 'gramm', 'kg', 'kilogram', 'kilograms', 'dkg', 'dag', 'mg',
  'ml', 'cl', 'dl', 'l', 'liter', 'liters', 'litre', 'litres', 'cm', 'mm',
])

const IMPERIAL = new Set([
  'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces',
  'cup', 'cups', 'pint', 'pints', 'pt', 'quart', 'quarts', 'qt', 'gallon', 'gallons', 'gal',
  'stick', 'sticks', 'inch', 'inches', 'in',
])

function clean(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\.+$/, '')
}

export function unitSystemOf(unit: string): UnitSystem | 'neutral' {
  const key = clean(unit)
  if (METRIC.has(key)) return 'metric'
  if (IMPERIAL.has(key)) return 'imperial'
  return 'neutral'
}

/**
 * True when any ingredient uses a unit from the other system. Only ingredient
 * units are checked — a temperature mentioned in step text alone ("350°F") does
 * not trigger a conversion.
 */
export function needsUnitConversion(
  ingredients: Pick<Ingredient, 'unit'>[],
  target: UnitSystem | null | undefined
): boolean {
  if (!target) return false
  return ingredients.some(({ unit }) => {
    const system = unitSystemOf(unit)
    return system !== 'neutral' && system !== target
  })
}
