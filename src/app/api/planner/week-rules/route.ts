import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    week_plan_id: string
    rule_type: string
    label: string
  }

  if (!body.week_plan_id) return NextResponse.json({ error: 'week_plan_id is required' }, { status: 400 })
  if (!body.label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('week_plan_rules')
    .insert({
      week_plan_id: body.week_plan_id,
      rule_type: body.rule_type ?? 'custom',
      label: body.label.trim(),
    })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
