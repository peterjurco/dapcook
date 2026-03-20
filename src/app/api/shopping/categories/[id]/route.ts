import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getHouseholdId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id ?? null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { name?: string; color?: string | null; sort_order?: number }
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.color !== undefined) updates.color = body.color
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('shopping_categories')
    .update(updates)
    .eq('id', params.id)
    .eq('household_id', householdId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { error } = await supabase
    .from('shopping_categories')
    .delete()
    .eq('id', params.id)
    .eq('household_id', householdId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
