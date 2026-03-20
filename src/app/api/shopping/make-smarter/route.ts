import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id

  const body = await request.json() as { list_id: string }
  if (!body.list_id) return NextResponse.json({ error: 'list_id is required' }, { status: 400 })

  // Verify list belongs to this household
  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('id', body.list_id)
    .eq('household_id', householdId)
    .maybeSingle()

  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const [{ data: items }, { data: categories }, { data: household }] = await Promise.all([
    supabase.from('shopping_items').select('*').eq('shopping_list_id', list.id).order('sort_order'),
    supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('households').select('preferred_units').eq('id', householdId).single(),
  ])

  if (!items?.length) return NextResponse.json({ error: 'List has no items' }, { status: 400 })

  const preferredUnits = household?.preferred_units ?? 'metric'

  let result
  try {
    result = await makeShoppingListSmart(items, categories ?? [], householdId, preferredUnits)
  } catch (err) {
    console.error('[make-smarter] AI call failed:', err)
    return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
  }

  // If AI invented new categories, save them
  if (result.newCategories.length > 0) {
    await supabase.from('shopping_categories').insert(
      result.newCategories.map(({ id: _id, created_at: _c, ...rest }) => rest)
    )
  }

  // Replace all items with merged ones
  await supabase.from('shopping_items').delete().eq('shopping_list_id', list.id)

  const toInsert = result.items.map((item, index) => ({
    shopping_list_id: list.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit || null,
    category: item.category,
    source_recipe_ids: item.source_recipe_ids,
    sort_order: index,
    is_checked: false,
  }))

  const { data: newItems, error: insertError } = await supabase
    .from('shopping_items')
    .insert(toInsert)
    .select()

  if (insertError) return NextResponse.json({ error: 'Failed to save items' }, { status: 500 })

  // Fetch updated categories (may include newly created ones)
  const { data: updatedCategories } = await supabase
    .from('shopping_categories')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order')

  return NextResponse.json({ items: newItems ?? [], categories: updatedCategories ?? [] })
}
