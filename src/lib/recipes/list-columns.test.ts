import { describe, expect, it } from 'vitest'
import { RECIPE_LIST_FIELDS, RECIPE_LIST_COLUMNS } from './list-columns'

describe('recipe list columns', () => {
  it('asks Postgres for exactly the fields the list renders', () => {
    expect(RECIPE_LIST_COLUMNS).toBe(
      'id, title, image_url, tags, prep_time_min, cook_time_min, servings'
    )
  })

  it('leaves out the two columns that dominate a recipe row', () => {
    // ingredients + steps are ~71% of an average row and nothing in a list
    // view reads them — see RecipeCard, RecipeList and RecipeSearch.
    expect(RECIPE_LIST_FIELDS).not.toContain('ingredients')
    expect(RECIPE_LIST_FIELDS).not.toContain('steps')
  })

  it('carries everything a card needs to render', () => {
    for (const field of ['id', 'title', 'image_url', 'tags', 'prep_time_min', 'cook_time_min', 'servings']) {
      expect(RECIPE_LIST_FIELDS).toContain(field)
    }
  })
})
