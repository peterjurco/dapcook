import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

async function verifyItemOwnership(
  supabase: ReturnType<typeof createClient>,
  itemId: string,
  householdId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('shopping_items')
    .select('shopping_list_id, shopping_lists!inner(household_id)')
    .eq('id', itemId)
    .maybeSingle()

  if (!data) return false
  const list = data.shopping_lists as unknown as { household_id: string }
  return list.household_id === householdId
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const owned = await verifyItemOwnership(supabase, params.id, householdId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json() as {
    is_checked?: boolean
    name?: string
    quantity?: number | null
    unit?: string | null
    category?: string | null
    sort_order?: number
  }

  const updates: Record<string, unknown> = {}
  if (body.is_checked !== undefined) updates.is_checked = body.is_checked
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.quantity !== undefined) updates.quantity = body.quantity
  if (body.unit !== undefined) updates.unit = body.unit
  if (body.category !== undefined) updates.category = body.category
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('shopping_items')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const owned = await verifyItemOwnership(supabase, params.id, householdId)
  if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await supabase.from('shopping_items').delete().eq('id', params.id)

  return new NextResponse(null, { status: 204 })
}
