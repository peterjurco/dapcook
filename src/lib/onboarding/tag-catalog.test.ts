import { describe, it, expect } from 'vitest'
import { TAG_CATALOG, buildTagGroupsPayload, selectionFromSavedTags } from './tag-catalog'
import { DEFAULT_SHOPPING_CATEGORIES, SHOPPING_RULE_EXAMPLES } from './defaults'
import { locales } from '@/i18n/config'

describe('TAG_CATALOG', () => {
  it('offers the agreed groups in order', () => {
    expect(TAG_CATALOG.map((g) => g.id)).toEqual(['course', 'cuisine', 'diet', 'ingredient'])
  })

  it('offers the agreed diet tags', () => {
    expect(TAG_CATALOG.find((g) => g.id === 'diet')?.tags).toEqual([
      { en: 'Vegetarian', sk: 'Vegetariánske' },
      { en: 'Vegan', sk: 'Vegánske' },
      { en: 'Gluten-free', sk: 'Bezlepkové' },
      { en: 'Dairy-free', sk: 'Bezmliečne' },
      { en: 'Lactose-free', sk: 'Bezlaktózové' },
      { en: 'High-protein', sk: 'Proteín' },
      { en: 'Keto', sk: 'Keto' },
    ])
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

describe('selectionFromSavedTags', () => {
  it('maps saved groups back to catalog groups by their localized name', () => {
    expect(selectionFromSavedTags([
      { name: 'Chod', tags: ['Polievka', 'Dezert'] },
      { name: 'Stravovanie', tags: ['Vegánske'] },
    ], 'sk')).toEqual({
      selected: { course: ['Polievka', 'Dezert'], diet: ['Vegánske'] },
      custom: {},
    })
  })

  it('turns saved tags missing from the catalog into custom chips of their group', () => {
    expect(selectionFromSavedTags([{ name: 'Diet', tags: ['Vegan', 'Paleo'] }], 'en')).toEqual({
      selected: { diet: ['Vegan', 'Paleo'] },
      custom: { diet: ['Paleo'] },
    })
  })

  it('ignores groups that are not in the catalog', () => {
    expect(selectionFromSavedTags([{ name: 'Mine', tags: ['x'] }], 'en')).toEqual({ selected: {}, custom: {} })
  })

  it('round-trips with buildTagGroupsPayload', () => {
    const saved = [{ name: 'Course', tags: ['Soup'] }, { name: 'Diet', tags: ['Paleo'] }]
    expect(buildTagGroupsPayload(selectionFromSavedTags(saved, 'en').selected, 'en')).toEqual(saved)
  })
})

describe('onboarding defaults', () => {
  it.each(locales)('has the 9 default shopping categories and rule examples in %s', (locale) => {
    expect(DEFAULT_SHOPPING_CATEGORIES).toHaveLength(9)
    expect(DEFAULT_SHOPPING_CATEGORIES[0][locale]).toBeTruthy()
    expect(SHOPPING_RULE_EXAMPLES.every((r) => r[locale].trim().length > 0)).toBe(true)
  })
})
