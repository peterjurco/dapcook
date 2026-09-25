import { describe, it, expect } from 'vitest'
import { TAG_CATALOG, buildTagGroupsPayload } from './tag-catalog'
import { DEFAULT_SHOPPING_CATEGORIES, SHOPPING_RULE_EXAMPLES } from './defaults'
import { locales } from '@/i18n/config'

describe('TAG_CATALOG', () => {
  it('offers the agreed groups in order', () => {
    expect(TAG_CATALOG.map((g) => g.id)).toEqual(['course', 'cuisine', 'diet', 'ingredient', 'effort'])
  })

  it.each(locales)('has every label in %s, and no tag name twice (tag names are unique per household)', (locale) => {
    const names = TAG_CATALOG.flatMap((g) => g.tags.map((t) => t[locale]))
    expect(names.every((n) => n.trim().length > 0)).toBe(true)
    expect(new Set(names).size).toBe(names.length)
    expect(TAG_CATALOG.every((g) => g.name[locale].trim().length > 0)).toBe(true)
  })
})

describe('buildTagGroupsPayload', () => {
  it('keeps only groups with a selection, names them in the UI language, in catalog order', () => {
    const payload = buildTagGroupsPayload({ diet: ['Vegánske'], course: ['Polievka', 'Dezert'] }, 'sk')
    expect(payload).toEqual([
      { name: 'Chod', tags: ['Polievka', 'Dezert'] },
      { name: 'Stravovanie', tags: ['Vegánske'] },
    ])
  })

  it('trims, drops blanks and removes duplicates', () => {
    expect(buildTagGroupsPayload({ cuisine: [' Italian ', 'Italian', ''] }, 'en')).toEqual([
      { name: 'Cuisine', tags: ['Italian'] },
    ])
  })

  it('returns nothing when nothing was picked', () => {
    expect(buildTagGroupsPayload({}, 'en')).toEqual([])
  })
})

describe('onboarding defaults', () => {
  it.each(locales)('has the 9 default shopping categories and rule examples in %s', (locale) => {
    expect(DEFAULT_SHOPPING_CATEGORIES).toHaveLength(9)
    expect(DEFAULT_SHOPPING_CATEGORIES[0][locale]).toBeTruthy()
    expect(SHOPPING_RULE_EXAMPLES.every((r) => r[locale].trim().length > 0)).toBe(true)
  })
})
