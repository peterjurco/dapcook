import { createClient } from '@/lib/supabase/server'
import { RecipeList } from '@/components/recipe/RecipeList'
import type { Recipe } from '@/types/database'

export default async function RecipesPage() {
  const supabase = createClient()

  const { data: recipes } = await supabase
    .from('recipes')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 lg:p-8">
      <RecipeList recipes={(recipes ?? []) as Recipe[]} />
    </div>
  )
}
