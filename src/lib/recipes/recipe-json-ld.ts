import type { Recipe } from '@/types/database'
import type { Ingredient, Step } from '@/types/recipe'

function duration(minutes: number | null): string | undefined {
  return minutes && minutes > 0 ? `PT${minutes}M` : undefined
}

export function buildRecipeJsonLd(recipe: Recipe): Record<string, unknown> {
  const ingredients = recipe.ingredients as unknown as Ingredient[]
  const steps = recipe.steps as unknown as Step[]
  const total = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    ...(recipe.description && { description: recipe.description }),
    ...(recipe.image_url && { image: [recipe.image_url] }),
    ...(duration(recipe.prep_time_min) && { prepTime: duration(recipe.prep_time_min) }),
    ...(duration(recipe.cook_time_min) && { cookTime: duration(recipe.cook_time_min) }),
    ...(duration(total) && { totalTime: duration(total) }),
    ...(recipe.servings && { recipeYield: `${recipe.servings} servings` }),
    ...(recipe.tags.length > 0 && { keywords: recipe.tags.join(', ') }),
    recipeIngredient: ingredients.map((ingredient) =>
      [ingredient.quantity, ingredient.unit, ingredient.name]
        .filter((part) => part !== null && part !== '')
        .join(' ') + (ingredient.notes ? `, ${ingredient.notes}` : '')
    ),
    recipeInstructions: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      text: step.text,
    })),
    ...(recipe.source_url && { isBasedOn: recipe.source_url }),
  }
}
