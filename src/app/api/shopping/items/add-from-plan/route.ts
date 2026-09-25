import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'
import type { ShoppingItem } from '@/types/database'
import type { PlanPayload } from '@/lib/shopping/plan-entries'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

interface ListItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as Partial<PlanPayload>
  const ingredients = (body.ingredients ?? []).filter((i) => typeof i?.name === 'string' && i.name.trim())
  // Typed custom meals (e.g. "rice") are added verbatim — name + portions, no AI.
  const customItems: ListItem[] = (body.customItems ?? [])
    .filter((c) => typeof c?.name === 'string' && c.name.trim())
    .map((c) => ({
      name: c.name.trim(),
      quantity: Number.isFinite(c.portions) && c.portions >= 1 ? c.portions : 1,
      unit: null,
      category: null,
    }))

  if (!ingredients.length && !customItems.length) {
    return NextResponse.json({ error: 'ingredients or customItems are required' }, { status: 400 })
  }

  const [{ data: categories }, { data: rulesRows }] = await Promise.all([
    supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('shopping_rules').select('rule').eq('household_id', householdId).order('created_at'),
  ])

  let allCategories = categories ?? []
  let mergedItems: ListItem[] = []

  if (ingredients.length) {
    const rawItems: ShoppingItem[] = ingredients.map((item, i) => ({
      id: `plan-${i}`,
      shopping_list_id: 'plan',
      name: item.name.trim(),
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null,
      unit: item.unit || null,
      category: null,
      is_checked: false,
      sort_order: i,
      source_recipe_ids: item.recipe_id ? [item.recipe_id] : [],
    }))
    const rules = (rulesRows ?? []).map((r) => r.rule)

    let result
    try {
      result = await makeShoppingListSmart(rawItems, allCategories, householdId, rules)
    } catch (err) {
      console.error('[shopping/add-from-plan] AI call failed:', err)
      return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
    }

    // The AI only invents categories when the household has none yet
    if (result.newCategories.length > 0) {
      await supabase.from('shopping_categories').insert(
        result.newCategories.map((cat) => ({
          household_id: cat.household_id,
          name: cat.name,
          color: cat.color,
          sort_order: cat.sort_order,
        }))
      )
      allCategories = result.newCategories
    }

    mergedItems = result.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || null,
      category: item.category || null,
    }))
  }

  // Sort by category order so items arrive grouped — prevents duplicate
  // category headers in the main shopping list. Custom items go last.
  const categoryOrder = new Map(allCategories.map((c, i) => [c.name, i]))
  const rank = (item: ListItem) => (item.category ? (categoryOrder.get(item.category) ?? 999) : 999)
  const toAppend = [...[...mergedItems].sort((a, b) => rank(a) - rank(b)), ...customItems]

  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Safety: create a list if somehow missing (e.g. old accounts)
  let listId = list?.id
  if (!listId) {
    const { data: created } = await supabase
      .from('shopping_lists')
      .insert({ household_id: householdId, name: 'Shopping list' })
      .select('id')
      .single()
    if (!created) return NextResponse.json({ error: 'Failed to get or create list' }, { status: 500 })
    listId = created.id
  }

  // New items go after existing ones
  const { data: maxItem } = await supabase
    .from('shopping_items')
    .select('sort_order')
    .eq('shopping_list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const startOrder = (maxItem?.sort_order ?? -1) + 1

  const { error } = await supabase.from('shopping_items').insert(
    toAppend.map((item, i) => ({
      shopping_list_id: listId as string,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      is_checked: false,
      sort_order: startOrder + i,
      source_recipe_ids: [] as string[],
    }))
  )
  if (error) return NextResponse.json({ error: 'Failed to insert items' }, { status: 500 })

  return NextResponse.json({ count: toAppend.length })
}
