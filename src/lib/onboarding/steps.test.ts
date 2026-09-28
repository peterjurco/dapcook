import { describe, it, expect } from 'vitest'
import { isPersistedStep, nextStep, persistedStepAfter, previousStep, stepNumber, TOTAL_STEPS } from './steps'

describe('onboarding steps', () => {
  it('walks the steps in order and stays on done', () => {
    expect(nextStep('language')).toBe('intro')
    expect(nextStep('intro')).toBe('household')
    expect(nextStep('household')).toBe('translation')
    expect(nextStep('shopping_categories')).toBe('invite')
    expect(nextStep('invite')).toBe('done')
    expect(nextStep('done')).toBe('done')
  })

  it('walks back one step at a time and stays on language', () => {
    expect(previousStep('intro')).toBe('language')
    expect(previousStep('units')).toBe('translation')
    expect(previousStep('invite')).toBe('shopping_categories')
    expect(previousStep('language')).toBe('language')
  })

  it('stores the following persisted step, and null after the last one', () => {
    expect(persistedStepAfter('translation')).toBe('units')
    expect(persistedStepAfter('shopping_categories')).toBe('invite')
    expect(persistedStepAfter('invite')).toBeNull()
  })

  it('recognises only the steps stored in the database', () => {
    expect(isPersistedStep('tags')).toBe(true)
    expect(isPersistedStep('household')).toBe(false)
    expect(isPersistedStep('done')).toBe(false)
    expect(isPersistedStep(42)).toBe(false)
  })

  it('numbers steps from intro to invite, leaving language and done uncounted', () => {
    expect(stepNumber('language')).toBe(0)
    expect(stepNumber('intro')).toBe(1)
    expect(stepNumber('invite')).toBe(TOTAL_STEPS)
    expect(stepNumber('done')).toBe(0)
    expect(TOTAL_STEPS).toBe(7)
  })
})
