import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id

  const body = await request.json() as {
    id: string
    list_id: string
    name: string
    quantity?: number | null
    unit?: string | null
    category?: string | null
  }

  if (!body.list_id || !body.name?.trim()) {
    return NextResponse.json({ error: 'list_id and name are required' }, { status: 400 })
  }
  if (!UUID_PATTERN.test(body.id ?? '')) {
    return NextResponse.json({ error: 'A valid id is required' }, { status: 400 })
  }

  // Verify list belongs to household
  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('id', body.list_id)
    .eq('household_id', householdId)
    .maybeSingle()

  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  // Get max sort_order
  const { data: last } = await supabase
    .from('shopping_items')
    .select('sort_order')
    .eq('shopping_list_id', list.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const sortOrder = (last?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('shopping_items')
    .insert({
      id: body.id,
      shopping_list_id: list.id,
      name: body.name.trim(),
      quantity: body.quantity ?? null,
      unit: body.unit ?? null,
      category: body.category ?? null,
      sort_order: sortOrder,
      source_recipe_ids: [],
    })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
