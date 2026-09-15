import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { listId: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { data: list } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('id', params.listId)
    .eq('household_id', householdId)
    .maybeSingle()

  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  await supabase.from('shopping_items').delete().eq('shopping_list_id', params.listId)

  return new NextResponse(null, { status: 204 })
}
