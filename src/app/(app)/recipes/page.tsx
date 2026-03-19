import { createClient } from '@/lib/supabase/server'
import { RecipeList } from '@/components/recipe/RecipeList'
import type { Recipe } from '@/types/database'

export default async function RecipesPage() {
  const supabase = createClient()

  const [{ data: recipes }, { data: tagsMeta }] = await Promise.all([
    supabase.from('recipes').select('*').eq('is_archived', false).order('created_at', { ascending: false }),
    supabase.from('tags').select('name, color'),
  ])

  const tagColors: Record<string, string | null> = {}
  for (const t of tagsMeta ?? []) tagColors[t.name] = t.color

  return (
    <div className="p-6 lg:p-8">
      <RecipeList recipes={(recipes ?? []) as Recipe[]} tagColors={tagColors} />
    </div>
  )
}
