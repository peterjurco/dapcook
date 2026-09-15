import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

export async function GET() {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { data, error } = await supabase
    .from('planner_rules')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { rule_type: string; label?: string; config?: Record<string, unknown> }

  if (!body.rule_type) return NextResponse.json({ error: 'rule_type is required' }, { status: 400 })
  if (!body.label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('planner_rules')
    .insert({
      household_id: householdId,
      rule_type: body.rule_type,
      label: body.label.trim(),
      config: (body.config ?? {}) as import('@/types/database').Json,
    })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
