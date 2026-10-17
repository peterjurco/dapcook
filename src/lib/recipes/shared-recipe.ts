import { perRequest } from '@/lib/auth/per-request'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Recipe } from '@/types/database'

/**
 * The active recipe behind a public share token, or null. Cached per request
 * so the page and its metadata share one query.
 */
export const getSharedRecipe = perRequest(async (token: string): Promise<Recipe | null> => {
  const { data, error } = await createAdminClient()
    .from('recipes')
    .select('*')
    .eq('share_token', token)
    .eq('is_archived', false)
    .maybeSingle()

  if (error) throw new Error('Unable to load shared recipe')
  return (data as Recipe | null) ?? null
})
