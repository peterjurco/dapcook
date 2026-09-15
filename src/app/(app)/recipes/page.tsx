import { createClient } from '@/lib/supabase/server'
import { RecipeList } from '@/components/recipe/RecipeList'
import { buildTagMeta, type Taxonomy } from '@/lib/tags/taxonomy'
import { RECIPE_LIST_COLUMNS, type RecipeListItem } from '@/lib/recipes/list-columns'
import { getCurrentUser } from '@/lib/auth/current-user'

export default async function RecipesPage() {
  const supabase = createClient()
  const user = await getCurrentUser()

  const [{ data: recipes }, { data: tagsMeta }, { data: groups }, { data: profile }] = await Promise.all([
    supabase.from('recipes').select(RECIPE_LIST_COLUMNS).eq('is_archived', false).order('created_at', { ascending: false }),
    supabase.from('tags').select('name, color, group_id'),
    supabase.from('tag_groups').select('id, name, position').order('position'),
    user
      ? supabase.from('profiles').select('default_recipe_filter').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const taxonomy: Taxonomy = { groups: groups ?? [], tags: buildTagMeta(tagsMeta ?? []) }

  return (
    <div className="p-6 lg:p-8">
      <RecipeList
        recipes={(recipes ?? []) as RecipeListItem[]}
        taxonomy={taxonomy}
        defaultFilter={profile?.default_recipe_filter ?? []}
      />
    </div>
  )
}
