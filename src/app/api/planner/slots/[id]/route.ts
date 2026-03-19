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
    day_of_week?: number
    recipe_id?: string | null
    custom_label?: string | null
    span_days?: number
  }

  const update: Record<string, unknown> = {}
  if (body.day_of_week !== undefined) update.day_of_week = body.day_of_week
  if (body.recipe_id !== undefined) update.recipe_id = body.recipe_id
  if (body.custom_label !== undefined) update.custom_label = body.custom_label
  if (body.span_days !== undefined) update.span_days = body.span_days

  const { data, error } = await supabase
    .from('meal_slots')
    .update(update)
    .eq('id', params.id)
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min)')
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
    .from('meal_slots')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
