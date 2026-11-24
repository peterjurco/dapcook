import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { TablesUpdate } from '@/types/database'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { name?: string; color?: string | null; sort_order?: number }
  const updates: TablesUpdate<'shopping_categories'> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.color !== undefined) updates.color = body.color
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  // Items name their category rather than point at it, so a rename has to carry them along.
  const { data: before } = updates.name
    ? await supabase.from('shopping_categories').select('name').eq('id', params.id).eq('household_id', householdId).maybeSingle()
    : { data: null }

  const { data, error } = await supabase
    .from('shopping_categories')
    .update(updates)
    .eq('id', params.id)
    .eq('household_id', householdId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })

  if (before && before.name !== data.name) {
    const { data: lists } = await supabase.from('shopping_lists').select('id').eq('household_id', householdId)
    const listIds = (lists ?? []).map((list) => list.id)
    if (listIds.length) {
      const { error: itemsError } = await supabase
        .from('shopping_items')
        .update({ category: data.name })
        .eq('category', before.name)
        .in('shopping_list_id', listIds)
      if (itemsError) console.error('[shopping/categories] moving items to the renamed category failed:', itemsError)
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { error } = await supabase
    .from('shopping_categories')
    .delete()
    .eq('id', params.id)
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
