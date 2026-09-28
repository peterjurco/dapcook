import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseDateString, spanFitsWeek } from '@/lib/utils/week'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getHouseholdWeekStartDay } from '@/lib/auth/household'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    date?: string
    recipe_id?: string | null
    custom_label?: string | null
    span_days?: number
  }

  const update: Record<string, unknown> = {}
  if (body.date !== undefined) {
    if (!parseDateString(body.date)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    update.date = body.date
  }
  if (body.span_days !== undefined) {
    if (!Number.isInteger(body.span_days) || body.span_days < 1 || body.span_days > 7) {
      return NextResponse.json({ error: 'span_days must be 1–7' }, { status: 400 })
    }
    update.span_days = body.span_days
  }
  if (body.recipe_id !== undefined) update.recipe_id = body.recipe_id
  if (body.custom_label !== undefined) update.custom_label = body.custom_label

  if (body.date !== undefined || body.span_days !== undefined) {
    const { data: current } = await supabase.from('meal_slots').select('date, span_days').eq('id', params.id).single()
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const date = body.date ?? current.date
    const span = body.span_days ?? current.span_days
    if (!spanFitsWeek(date, span, await getHouseholdWeekStartDay())) {
      return NextResponse.json({ error: 'Meal must end within its week' }, { status: 400 })
    }
  }

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
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('meal_slots')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
