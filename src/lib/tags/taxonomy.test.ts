import { describe, expect, it } from 'vitest'
import {
  EMPTY_TAXONOMY,
  buildFilterSections,
  buildTagMeta,
  filterRecipesByTags,
  orderTagsForCard,
  sanitizeDefaultFilter,
  sortedGroups,
  tagColor,
  tagsByUsage,
  type Taxonomy,
} from './taxonomy'
import type { Recipe } from '@/types/database'

function makeRecipe(id: string, tags: string[]): Recipe {
  return {
    id,
    household_id: 'hh-1',
    created_by: 'user-1',
    title: id,
    description: null,
    source_url: null,
    image_url: null,
    prep_time_min: null,
    cook_time_min: null,
    servings: null,
    tags,
    ingredients: [],
    steps: [],
    notes: null,
    is_archived: false,
    last_used_at: null,
    share_token: null,
    title_normalized: id,
    created_at: '2026-08-07T00:00:00.000Z',
    updated_at: '2026-08-07T00:00:00.000Z',
  } as Recipe
}

const course = { id: 'g-course', name: 'Course', position: 0 }
const cuisine = { id: 'g-cuisine', name: 'Cuisine', position: 1 }
const mood = { id: 'g-mood', name: 'Mood', position: 2 }

const taxonomy: Taxonomy = {
  groups: [course, cuisine, mood],
  tags: {
    main: { color: null, groupId: 'g-course' },
    side: { color: null, groupId: 'g-course' },
    dessert: { color: null, groupId: 'g-course' },
    italian: { color: null, groupId: 'g-cuisine' },
    asian: { color: null, groupId: 'g-cuisine' },
    comfort: { color: null, groupId: 'g-mood' },
    quick: { color: null, groupId: null },
    vegan: { color: null, groupId: null },
  },
}

describe('sortedGroups', () => {
  it('returns every group, ordered by position', () => {
    expect(sortedGroups(taxonomy).map((g) => g.id)).toEqual(['g-course', 'g-cuisine', 'g-mood'])
  })

  it('returns an empty array for a taxonomy with no groups', () => {
    expect(sortedGroups(EMPTY_TAXONOMY)).toEqual([])
  })
})

describe('tagColor', () => {
  it('returns the stored colour, or null when the tag has no metadata', () => {
    const withColor: Taxonomy = { groups: [], tags: { main: { color: '#ef4444', groupId: null } } }
    expect(tagColor(withColor, 'main')).toBe('#ef4444')
    expect(tagColor(withColor, 'unknown')).toBeNull()
  })
})

describe('buildTagMeta', () => {
  it('maps each row by name', () => {
    const rows = [
      { name: 'main', color: '#ef4444', group_id: 'g-course' },
      { name: 'quick', color: null, group_id: null },
    ]
    expect(buildTagMeta(rows)).toEqual({
      main: { color: '#ef4444', groupId: 'g-course' },
      quick: { color: null, groupId: null },
    })
  })

  it('returns an empty object for no rows', () => {
    expect(buildTagMeta([])).toEqual({})
  })
})

describe('tagsByUsage', () => {
  it('orders tags by descending usage count', () => {
    const recipes = [
      makeRecipe('r1', ['main', 'italian']),
      makeRecipe('r2', ['main']),
      makeRecipe('r3', ['vegan']),
    ]
    expect(tagsByUsage(recipes)).toEqual(['main', 'italian', 'vegan'])
  })

  it('returns an empty array when no recipe has tags', () => {
    expect(tagsByUsage([makeRecipe('r1', [])])).toEqual([])
  })
})

describe('orderTagsForCard', () => {
  it('puts grouped tags first, ordered by group position, then ungrouped tags', () => {
    const result = orderTagsForCard(['quick', 'italian', 'main'], taxonomy)
    expect(result).toEqual(['main', 'italian', 'quick'])
  })

  it('orders across every group by position, not just the first two', () => {
    const result = orderTagsForCard(['comfort', 'main'], taxonomy)
    expect(result).toEqual(['main', 'comfort'])
  })

  it('preserves the original order when no groups exist', () => {
    const result = orderTagsForCard(['quick', 'vegan'], EMPTY_TAXONOMY)
    expect(result).toEqual(['quick', 'vegan'])
  })

  it('preserves relative order within the same group', () => {
    const result = orderTagsForCard(['side', 'main'], taxonomy)
    expect(result).toEqual(['side', 'main'])
  })
})

describe('buildFilterSections', () => {
  const recipes = [
    makeRecipe('r1', ['main', 'italian', 'quick']),
    makeRecipe('r2', ['main', 'comfort']),
    makeRecipe('r3', ['dessert', 'vegan']),
  ]

  it('returns no group sections and all tags ungrouped when there are no groups', () => {
    const sections = buildFilterSections(recipes, EMPTY_TAXONOMY)
    expect(sections.groups).toEqual([])
    expect(sections.ungrouped).toEqual(['main', 'italian', 'quick', 'comfort', 'dessert', 'vegan'])
  })

  it('gives every group its own section, and flattens ungrouped tags', () => {
    const sections = buildFilterSections(recipes, taxonomy)
    expect(sections.groups.map((s) => s.group.id)).toEqual(['g-course', 'g-cuisine', 'g-mood'])
    expect(sections.groups[0].tags).toEqual(['main', 'dessert'])
    expect(sections.groups[1].tags).toEqual(['italian'])
    expect(sections.groups[2].tags).toEqual(['comfort'])
    expect(sections.ungrouped).toEqual(['quick', 'vegan'])
  })

  it('omits group members that no recipe uses', () => {
    const sections = buildFilterSections([makeRecipe('r1', ['main'])], taxonomy)
    expect(sections.groups).toHaveLength(1)
    expect(sections.groups[0].group.id).toBe('g-course')
    expect(sections.groups[0].tags).toEqual(['main'])
  })

  it('drops group sections that end up empty', () => {
    const sections = buildFilterSections([makeRecipe('r1', ['quick'])], taxonomy)
    expect(sections.groups).toEqual([])
    expect(sections.ungrouped).toEqual(['quick'])
  })
})

describe('filterRecipesByTags', () => {
  const recipes = [
    makeRecipe('r1', ['main', 'italian', 'quick']),
    makeRecipe('r2', ['side', 'italian']),
    makeRecipe('r3', ['main', 'asian']),
    makeRecipe('r4', ['dessert', 'quick', 'vegan']),
  ]

  it('returns everything when nothing is selected', () => {
    expect(filterRecipesByTags(recipes, [], taxonomy)).toHaveLength(4)
  })

  it('ORs tags within the same group', () => {
    const result = filterRecipesByTags(recipes, ['main', 'side'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2', 'r3'])
  })

  it('ANDs across different groups', () => {
    const result = filterRecipesByTags(recipes, ['main', 'side', 'italian'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('ANDs ungrouped tags with each other', () => {
    const result = filterRecipesByTags(recipes, ['quick', 'vegan'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r4'])
  })

  it('ANDs ungrouped tags with grouped ones', () => {
    const result = filterRecipesByTags(recipes, ['main', 'quick'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('ANDs every tag when there are no groups', () => {
    const result = filterRecipesByTags(recipes, ['main', 'italian'], EMPTY_TAXONOMY)
    expect(result.map((r) => r.id)).toEqual(['r1'])
  })

  it('filters correctly for a group with a single member tag', () => {
    const extra = [...recipes, makeRecipe('r5', ['comfort'])]
    const result = filterRecipesByTags(extra, ['comfort'], taxonomy)
    expect(result.map((r) => r.id)).toEqual(['r5'])
  })
})

describe('sanitizeDefaultFilter', () => {
  it('keeps only names that still exist', () => {
    expect(sanitizeDefaultFilter(['main', 'gone'], ['main', 'side'])).toEqual(['main'])
  })

  it('returns an empty array when nothing survives', () => {
    expect(sanitizeDefaultFilter(['gone'], ['main'])).toEqual([])
  })

  it('handles an empty stored default', () => {
    expect(sanitizeDefaultFilter([], ['main'])).toEqual([])
  })
})
