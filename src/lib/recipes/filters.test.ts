import { describe, expect, it } from 'vitest'
import {
  activeFilterCount,
  applyFilters,
  matchesRange,
  presetFor,
  SERVINGS_PRESETS,
  TIME_PRESETS,
  totalTime,
  type FilterCriteria,
} from './filters'
import { EMPTY_TAXONOMY } from '@/lib/tags/taxonomy'
import type { RecipeListItem } from './list-columns'

function recipe(id: string, over: Partial<RecipeListItem> = {}): RecipeListItem {
  return {
    id,
    title: id,
    image_url: null,
    tags: [],
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    ...over,
  }
}

const none: FilterCriteria = { tags: [], time: null, servings: null, search: '', ingredientIds: null }

describe('totalTime', () => {
  it('adds prep and cook', () => {
    expect(totalTime(recipe('a', { prep_time_min: 10, cook_time_min: 20 }))).toBe(30)
  })
  it('counts a missing half as 0', () => {
    expect(totalTime(recipe('a', { prep_time_min: 10 }))).toBe(10)
    expect(totalTime(recipe('a', { cook_time_min: 25 }))).toBe(25)
  })
  it('is null only when both are missing', () => {
    expect(totalTime(recipe('a'))).toBeNull()
  })
})

describe('matchesRange', () => {
  it('matches anything when there is no range', () => {
    expect(matchesRange(null, null)).toBe(true)
    expect(matchesRange(5, null)).toBe(true)
  })
  it('never matches a missing value against an active range', () => {
    expect(matchesRange(null, { min: null, max: 15 })).toBe(false)
  })
  it('treats both bounds as inclusive and null bounds as open', () => {
    expect(matchesRange(15, { min: null, max: 15 })).toBe(true)
    expect(matchesRange(16, { min: null, max: 15 })).toBe(false)
    expect(matchesRange(61, { min: 61, max: null })).toBe(true)
    expect(matchesRange(60, { min: 61, max: null })).toBe(false)
    expect(matchesRange(30, { min: 16, max: 30 })).toBe(true)
  })
})

describe('presets', () => {
  it('put every total time in exactly one time preset', () => {
    for (const minutes of [0, 15, 16, 30, 31, 60, 61, 240]) {
      const hits = TIME_PRESETS.filter((p) => matchesRange(minutes, p.range))
      expect(hits, `${minutes} min`).toHaveLength(1)
    }
  })
  it('put every serving count in exactly one servings preset', () => {
    for (const n of [1, 2, 3, 4, 5, 12]) {
      expect(SERVINGS_PRESETS.filter((p) => matchesRange(n, p.range)), `${n}`).toHaveLength(1)
    }
  })
})

describe('presetFor', () => {
  it('finds the preset with exactly the same bounds', () => {
    expect(presetFor({ min: 16, max: 30 }, TIME_PRESETS)?.label).toBe('15–30')
    expect(presetFor({ min: null, max: 15 }, TIME_PRESETS)?.label).toBe('≤ 15')
  })
  it('returns undefined for a custom range or no range', () => {
    expect(presetFor({ min: 16, max: 40 }, TIME_PRESETS)).toBeUndefined()
    expect(presetFor(null, TIME_PRESETS)).toBeUndefined()
  })
})

describe('applyFilters', () => {
  const quick = recipe('quick', { title: 'Čučoriedkový koláč', prep_time_min: 5, cook_time_min: 5, servings: 2, tags: ['sweet'] })
  const slow = recipe('slow', { title: 'Guláš', prep_time_min: 30, cook_time_min: 90, servings: 6 })
  const unknown = recipe('unknown', { title: 'Mystery' })
  const all = [quick, slow, unknown]

  it('returns everything with no criteria', () => {
    expect(applyFilters(all, none, EMPTY_TAXONOMY)).toEqual(all)
  })
  it('filters by total time and drops recipes with no time', () => {
    expect(applyFilters(all, { ...none, time: { min: null, max: 15 } }, EMPTY_TAXONOMY)).toEqual([quick])
  })
  it('filters by servings and drops recipes with no servings', () => {
    expect(applyFilters(all, { ...none, servings: { min: 5, max: null } }, EMPTY_TAXONOMY)).toEqual([slow])
  })
  it('keeps only recipes in the ingredient id set', () => {
    expect(applyFilters(all, { ...none, ingredientIds: new Set(['slow', 'unknown']) }, EMPTY_TAXONOMY)).toEqual([slow, unknown])
  })
  it('matches the title search ignoring case and diacritics', () => {
    expect(applyFilters(all, { ...none, search: 'gulas' }, EMPTY_TAXONOMY)).toEqual([slow])
    expect(applyFilters(all, { ...none, search: '  ČUČO ' }, EMPTY_TAXONOMY)).toEqual([quick])
  })
  it('ANDs every criterion together', () => {
    expect(
      applyFilters(all, { ...none, tags: ['sweet'], time: { min: null, max: 15 }, servings: { min: 5, max: null } }, EMPTY_TAXONOMY)
    ).toEqual([])
  })
})

describe('activeFilterCount', () => {
  it('counts tags plus one per active range and ingredient term', () => {
    expect(activeFilterCount({ tags: [], time: null, servings: null, ingredient: '' })).toBe(0)
    expect(
      activeFilterCount({ tags: ['a', 'b'], time: { min: null, max: 15 }, servings: { min: 5, max: null }, ingredient: 'garlic' })
    ).toBe(5)
  })
  it('ignores an ingredient term too short to search', () => {
    expect(activeFilterCount({ tags: [], time: null, servings: null, ingredient: ' g ' })).toBe(0)
  })
})
