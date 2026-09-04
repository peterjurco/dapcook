import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getHouseholdId(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from('profiles').select('household_id').eq('id', userId).single()
  return data?.household_id ?? null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { name: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const oldName = decodeURIComponent(params.name)
  const body = await request.json() as {
    newName?: string
    color?: string | null
    groupId?: string | null
  }

  if (body.newName !== undefined) {
    const newName = body.newName.trim().toLowerCase()
    if (!newName) return NextResponse.json({ error: 'newName cannot be empty' }, { status: 400 })
    // Rename tag across all recipes + tags table atomically
    const { error } = await supabase.rpc('rename_tag', {
      p_household_id: householdId,
      p_old_name: oldName,
      p_new_name: newName,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (body.color !== undefined || body.groupId !== undefined) {
    const nameForMeta = body.newName?.trim().toLowerCase() ?? oldName
    const row: { household_id: string; name: string; color?: string | null; group_id?: string | null } = {
      household_id: householdId,
      name: nameForMeta,
    }
    if (body.color !== undefined) row.color = body.color
    if (body.groupId !== undefined) row.group_id = body.groupId

    const { error } = await supabase
      .from('tags')
      .upsert(row, { onConflict: 'household_id,name' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { name: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getHouseholdId(supabase, user.id)
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const name = decodeURIComponent(params.name)
  const { error } = await supabase.rpc('delete_tag', {
    p_household_id: householdId,
    p_name: name,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
