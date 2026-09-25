import { describe, expect, it } from 'vitest'
import { createTranslator } from 'use-intl'
import skRecipes from '../../messages/sk/recipes.json'
import skSettings from '../../messages/sk/settings.json'
import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages'

// Slovak needs the genitive after "do" ("do slovenčiny"), so these messages
// select on the language code instead of interpolating the English name.
const recipes = createTranslator({ locale: 'sk', namespace: 'recipes', messages: { recipes: skRecipes } })
const settings = createTranslator({ locale: 'sk', namespace: 'settings', messages: { settings: skSettings } })

const messages = [
  { key: 'recipes import.stepTranslating', t: (v: Record<string, string>) => recipes('import.stepTranslating', v) },
  { key: 'settings translation.confirmMessage', t: (v: Record<string, string>) => settings('translation.confirmMessage', v) },
]

describe('Slovak target-language messages', () => {
  it('names the target language in the genitive', () => {
    expect(recipes('import.stepTranslating', { language: 'sk', languageName: 'Slovak' })).toBe('Prekladám do slovenčiny...')
    expect(settings('translation.confirmMessage', { language: 'cs', languageName: 'Czech' })).toBe('Preložiť vaše recepty do češtiny?')
  })

  describe.each(messages)('$key', ({ t }) => {
    it.each(SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]))(
      'has a Slovak form for %s instead of the English fallback',
      (code, label) => {
        expect(t({ language: code, languageName: label })).not.toContain(label)
      }
    )
  })
})
