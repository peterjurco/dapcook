import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    rule_type?: string
    label?: string
    config?: Record<string, unknown>
    is_active?: boolean
  }

  const update: Record<string, unknown> = {}
  if (body.rule_type !== undefined) update.rule_type = body.rule_type
  if (body.label !== undefined) update.label = body.label.trim()
  if (body.config !== undefined) update.config = body.config
  if (body.is_active !== undefined) update.is_active = body.is_active

  const { data, error } = await supabase
    .from('planner_rules')
    .update(update)
    .eq('id', params.id)
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

  const { error } = await supabase
    .from('planner_rules')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
