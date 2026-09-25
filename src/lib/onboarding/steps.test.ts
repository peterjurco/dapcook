import { describe, it, expect } from 'vitest'
import { isPersistedStep, nextStep, persistedStepAfter, stepNumber, TOTAL_STEPS } from './steps'

describe('onboarding steps', () => {
  it('walks the steps in order and stays on done', () => {
    expect(nextStep('language')).toBe('intro')
    expect(nextStep('intro')).toBe('household')
    expect(nextStep('household')).toBe('translation')
    expect(nextStep('shopping_rules')).toBe('done')
    expect(nextStep('done')).toBe('done')
  })

  it('stores the following persisted step, and null after the last one', () => {
    expect(persistedStepAfter('translation')).toBe('units')
    expect(persistedStepAfter('shopping_categories')).toBe('shopping_rules')
    expect(persistedStepAfter('shopping_rules')).toBeNull()
  })

  it('recognises only the steps stored in the database', () => {
    expect(isPersistedStep('tags')).toBe(true)
    expect(isPersistedStep('household')).toBe(false)
    expect(isPersistedStep('done')).toBe(false)
    expect(isPersistedStep(42)).toBe(false)
  })

  it('numbers steps from intro, leaving the language step uncounted', () => {
    expect(stepNumber('language')).toBe(0)
    expect(stepNumber('intro')).toBe(1)
    expect(stepNumber('done')).toBe(TOTAL_STEPS)
    expect(TOTAL_STEPS).toBe(8)
  })
})
