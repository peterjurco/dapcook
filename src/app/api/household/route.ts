import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_LANGUAGE_CODES } from '@/lib/constants/languages'

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { preferred_units?: 'metric' | 'imperial'; preferred_language?: string; translation_enabled?: boolean }

  const updates: Record<string, unknown> = {}
  if (body.preferred_units !== undefined) {
    if (!['metric', 'imperial'].includes(body.preferred_units)) {
      return NextResponse.json({ error: 'Invalid preferred_units' }, { status: 400 })
    }
    updates.preferred_units = body.preferred_units
  }

  if (body.preferred_language !== undefined) {
    if (!VALID_LANGUAGE_CODES.includes(body.preferred_language)) {
      return NextResponse.json({ error: 'Invalid preferred_language' }, { status: 400 })
    }
    updates.preferred_language = body.preferred_language
  }

  if (body.translation_enabled !== undefined) {
    if (typeof body.translation_enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid translation_enabled' }, { status: 400 })
    }
    updates.translation_enabled = body.translation_enabled
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
