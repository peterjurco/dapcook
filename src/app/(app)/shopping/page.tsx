import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ShoppingClient } from '@/components/shopping/ShoppingClient'
import { getWeekStart, nextWeekStart, toDateString } from '@/lib/utils/week'
import type { ShoppingList, ShoppingItem, ShoppingCategory } from '@/types/database'

interface PageProps {
  searchParams: { from?: string; to?: string }
}

export default async function ShoppingPage({ searchParams }: PageProps) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/onboarding')
  const householdId = profile.household_id

  // Default date range: next week
  const nextMonday = nextWeekStart(getWeekStart())
  const nextSunday = new Date(nextMonday)
  nextSunday.setDate(nextSunday.getDate() + 6)

  const defaultDateFrom = toDateString(nextMonday)
  const defaultDateTo = toDateString(nextSunday)

  // URL params override defaults (from planner CTA)
  const dateFrom = searchParams.from ?? defaultDateFrom
  const dateTo = searchParams.to ?? defaultDateTo

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
      defaultDateFrom={dateFrom}
      defaultDateTo={dateTo}
    />
  )
}
