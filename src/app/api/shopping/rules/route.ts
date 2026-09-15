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

  const { data: rules } = await supabase
    .from('shopping_rules')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at')

  return NextResponse.json(rules ?? [])
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { rule: string }
  if (!body.rule?.trim()) return NextResponse.json({ error: 'rule is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('shopping_rules')
    .insert({ household_id: householdId, rule: body.rule.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
