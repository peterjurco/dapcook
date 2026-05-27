import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface AppendItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id

  const body = await request.json() as { items: AppendItem[] }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  // Get the household's shopping list
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

  // Find current max sort_order so new items go after existing ones
  const { data: maxItem } = await supabase
    .from('shopping_items')
    .select('sort_order')
    .eq('shopping_list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const startOrder = (maxItem?.sort_order ?? -1) + 1

  const validItems = body.items.filter((item) => typeof item.name === 'string' && item.name.trim().length > 0)
  if (validItems.length === 0) {
    return NextResponse.json({ error: 'No valid items to insert' }, { status: 400 })
  }

  const toInsert = validItems.map((item, i) => ({
    shopping_list_id: listId as string,
    name: item.name,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    category: item.category ?? null,
    is_checked: false,
    sort_order: startOrder + i,
    source_recipe_ids: [] as string[],
  }))

  const { error } = await supabase.from('shopping_items').insert(toInsert)
  if (error) return NextResponse.json({ error: 'Failed to insert items' }, { status: 500 })

  return NextResponse.json({ count: toInsert.length })
}
