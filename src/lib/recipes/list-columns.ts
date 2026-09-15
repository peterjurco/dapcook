import type { Recipe } from '@/types/database'

/**
 * The recipe columns a list view renders.
 *
 * `select('*')` used to hand every list the full row, and `ingredients` +
 * `steps` are around 71% of an average one — measured at 173.9 KB for 51
 * recipes against 19.2 KB for these columns alone. Nothing in a list reads
 * them: see `RecipeCard`, `RecipeList` and `RecipeSearch`.
 *
 * `RecipeListItem` is derived from this list rather than written out
 * separately, so the type and the query cannot drift apart — widen the list
 * and the type follows, and TypeScript points at every reader that needs more.
 */
export const RECIPE_LIST_FIELDS = [
  'id',
  'title',
  'image_url',
  'tags',
  'prep_time_min',
  'cook_time_min',
  'servings',
] as const satisfies readonly (keyof Recipe)[]

export type RecipeListItem = Pick<Recipe, (typeof RECIPE_LIST_FIELDS)[number]>

/** The same fields in the form PostgREST's `.select()` expects. */
// The literal type is what lets supabase-js infer the row shape from the
// query; the unit test keeps it honest against RECIPE_LIST_FIELDS.
export const RECIPE_LIST_COLUMNS = RECIPE_LIST_FIELDS.join(
  ', '
) as 'id, title, image_url, tags, prep_time_min, cook_time_min, servings'
