import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShoppingClient } from '@/components/shopping/ShoppingClient'
import type { ShoppingList, ShoppingItem, ShoppingCategory } from '@/types/database'

export default async function ShoppingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/onboarding')
  const householdId = profile.household_id

  const [{ data: list }, { data: categories }] = await Promise.all([
    supabase
      .from('shopping_lists')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('shopping_categories')
      .select('*')
      .eq('household_id', householdId)
      .order('sort_order'),
  ])

  let items: ShoppingItem[] = []
  let recipeNames: Record<string, string> = {}
  if (list) {
    const { data } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('shopping_list_id', list.id)
      .order('sort_order')
    items = data ?? []

    const recipeIds = Array.from(new Set(items.flatMap((i) => i.source_recipe_ids)))
    if (recipeIds.length > 0) {
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, title')
        .in('id', recipeIds)
      recipeNames = Object.fromEntries((recipes ?? []).map((r) => [r.id, r.title]))
    }
  }

  return (
    <ShoppingClient
      initialList={(list as ShoppingList | null) ?? null}
      initialItems={items}
      initialCategories={(categories as ShoppingCategory[]) ?? []}
      initialRecipeNames={recipeNames}
    />
  )
}
