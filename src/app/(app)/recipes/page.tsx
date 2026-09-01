import { createClient } from '@/lib/supabase/server'
import { RecipeList } from '@/components/recipe/RecipeList'
import { buildTagMeta, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

export default async function RecipesPage() {
  const supabase = createClient()

  const [{ data: recipes }, { data: tagsMeta }, { data: groups }] = await Promise.all([
    supabase.from('recipes').select('*').eq('is_archived', false).order('created_at', { ascending: false }),
    supabase.from('tags').select('name, color, group_id'),
    supabase.from('tag_groups').select('id, name, position, is_pinned').order('position'),
  ])

  const taxonomy: Taxonomy = { groups: groups ?? [], tags: buildTagMeta(tagsMeta ?? []) }

  return (
    <div className="p-6 lg:p-8">
      <RecipeList recipes={(recipes ?? []) as Recipe[]} taxonomy={taxonomy} />
    </div>
  )
}
