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

  // Remember the old name: the household's items are moved to the new one below.
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
    await recategorizeItems(supabase, householdId, before.name, data.name)
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

  const { data: deleted, error } = await supabase
    .from('shopping_categories')
    .delete()
    .eq('id', params.id)
    .eq('household_id', householdId)
    .select('name')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Its items stay on the list, uncategorized.
  if (deleted) await recategorizeItems(supabase, householdId, deleted.name, null)

  return new NextResponse(null, { status: 204 })
}

/**
 * Items name their category rather than point at it, so renaming or deleting a
 * category has to carry the household's items along (`to` null = uncategorized).
 * Best effort: the category change itself has already succeeded.
 */
async function recategorizeItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  from: string,
  to: string | null
): Promise<void> {
  const { data: lists } = await supabase.from('shopping_lists').select('id').eq('household_id', householdId)
  const listIds = (lists ?? []).map((list) => list.id)
  if (!listIds.length) return
  const { error } = await supabase
    .from('shopping_items')
    .update({ category: to })
    .eq('category', from)
    .in('shopping_list_id', listIds)
  if (error) console.error('[shopping/categories] updating items after a category change failed:', error)
}
