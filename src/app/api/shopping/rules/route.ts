import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const { data: rules } = await supabase
    .from('shopping_rules')
    .select('*')
    .eq('household_id', profile.household_id)
    .order('created_at')

  return NextResponse.json(rules ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { rule: string }
  if (!body.rule?.trim()) return NextResponse.json({ error: 'rule is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('shopping_rules')
    .insert({ household_id: profile.household_id, rule: body.rule.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
