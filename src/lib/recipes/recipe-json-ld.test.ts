import { describe, expect, it } from 'vitest'
import { buildRecipeJsonLd } from './recipe-json-ld'
import type { Recipe } from '@/types/database'

const recipe = {
  id: 'recipe-1',
  household_id: 'household-1',
  created_by: 'user-1',
  title: 'Tomato Pasta',
  description: 'Fast pasta',
  source_url: 'https://recipes.test/tomato-pasta',
  image_url: 'https://images.test/pasta.jpg',
  prep_time_min: 10,
  cook_time_min: 20,
  servings: 4,
  tags: ['quick', 'vegetarian'],
  ingredients: [
    { id: 'ingredient-1', quantity: 200, unit: 'g', name: 'pasta', notes: '' },
    { id: 'ingredient-2', quantity: 2, unit: '', name: 'tomato', notes: 'chopped' },
  ],
  steps: [
    { id: 'step-1', order: 0, text: 'Boil pasta.' },
    { id: 'step-2', order: 1, text: 'Add tomato.' },
  ],
  notes: null,
  is_archived: false,
  last_used_at: null,
  share_token: null,
  title_normalized: 'tomato pasta',
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
} satisfies Recipe

describe('buildRecipeJsonLd', () => {
  it('maps a recipe to schema.org Recipe data', () => {
    expect(buildRecipeJsonLd(recipe)).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Tomato Pasta',
      description: 'Fast pasta',
      image: ['https://images.test/pasta.jpg'],
      prepTime: 'PT10M',
      cookTime: 'PT20M',
      totalTime: 'PT30M',
      recipeYield: '4 servings',
      keywords: 'quick, vegetarian',
      isBasedOn: 'https://recipes.test/tomato-pasta',
      recipeIngredient: ['200 g pasta', '2 tomato, chopped'],
      recipeInstructions: [
        { '@type': 'HowToStep', position: 1, text: 'Boil pasta.' },
        { '@type': 'HowToStep', position: 2, text: 'Add tomato.' },
      ],
    })
  })
})
