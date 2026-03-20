import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
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

  if (!list) {
    return NextResponse.json({ list: null, items: [], categories: categories ?? [] })
  }

  const { data: items } = await supabase
    .from('shopping_items')
    .select('*')
    .eq('shopping_list_id', list.id)
    .order('sort_order')

  // Collect all referenced recipe IDs and fetch their titles
  const recipeIds = Array.from(new Set((items ?? []).flatMap((i) => i.source_recipe_ids)))
  let recipeNames: Record<string, string> = {}
  if (recipeIds.length > 0) {
    const { data: recipes } = await supabase
      .from('recipes')
      .select('id, title')
      .in('id', recipeIds)
    recipeNames = Object.fromEntries((recipes ?? []).map((r) => [r.id, r.title]))
  }

  return NextResponse.json({ list, items: items ?? [], categories: categories ?? [], recipeNames })
}
