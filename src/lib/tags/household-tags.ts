import type { createClient } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof createClient>

/**
 * Every tag name the household uses — on non-archived recipes or in the
 * `tags` metadata table — lowercased, unique and sorted.
 */
export async function loadHouseholdTagNames(supabase: Supabase, householdId: string): Promise<string[]> {
  const [{ data: recipes }, { data: tagRows }] = await Promise.all([
    supabase.from('recipes').select('tags').eq('household_id', householdId).eq('is_archived', false),
    supabase.from('tags').select('name').eq('household_id', householdId),
  ])
  const names = new Set<string>()
  for (const recipe of recipes ?? []) for (const tag of recipe.tags ?? []) names.add(tag.toLowerCase())
  for (const row of tagRows ?? []) names.add(row.name.toLowerCase())
  return Array.from(names).sort()
}
