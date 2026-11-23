import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Whether the signed-in user may plan `recipeId`. `supabase` must be the
 * user's own (RLS) client: recipes outside their household are invisible to
 * it, so they read as missing. Without this check a meal slot could point at
 * another household's recipe.
 */
export async function canPlanRecipe(supabase: SupabaseClient<Database>, recipeId: string): Promise<boolean> {
  const { data } = await supabase.from('recipes').select('id').eq('id', recipeId).maybeSingle()
  return data !== null
}
