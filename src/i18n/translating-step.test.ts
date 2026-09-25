import { describe, expect, it } from 'vitest'
import { createTranslator } from 'use-intl'
import skRecipes from '../../messages/sk/recipes.json'
import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages'

const t = createTranslator({ locale: 'sk', namespace: 'recipes', messages: { recipes: skRecipes } })

describe('Slovak translating step', () => {
  it('names the target language in the genitive', () => {
    expect(t('import.stepTranslating', { language: 'sk', languageName: 'Slovak' })).toBe('Prekladám do slovenčiny...')
    expect(t('import.stepTranslating', { language: 'en', languageName: 'English' })).toBe('Prekladám do angličtiny...')
  })

  it.each(SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]))(
    'has a Slovak form for %s instead of the English fallback',
    (code, label) => {
      expect(t('import.stepTranslating', { language: code, languageName: label })).not.toContain(label)
    }
  )
})
