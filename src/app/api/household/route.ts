import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { preferred_units?: 'metric' | 'imperial' }

  const updates: Record<string, unknown> = {}
  if (body.preferred_units !== undefined) {
    if (!['metric', 'imperial'].includes(body.preferred_units)) {
      return NextResponse.json({ error: 'Invalid preferred_units' }, { status: 400 })
    }
    updates.preferred_units = body.preferred_units
  }

  const { data, error } = await supabase
    .from('households')
    .update(updates)
    .eq('id', profile.household_id)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data)
}
