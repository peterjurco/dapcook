import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseDateString, spanFitsWeek } from '@/lib/utils/week'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId, getHouseholdWeekStartDay } from '@/lib/auth/household'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as {
    date?: string
    recipe_id?: string
    custom_label?: string
    span_days?: number
  }

  const span = body.span_days ?? 1
  if (!parseDateString(body.date)) {
    return NextResponse.json({ error: 'date is required (YYYY-MM-DD)' }, { status: 400 })
  }
  if (!Number.isInteger(span) || span < 1 || span > 7) {
    return NextResponse.json({ error: 'span_days must be 1–7' }, { status: 400 })
  }
  if (!body.recipe_id && !body.custom_label) {
    return NextResponse.json({ error: 'recipe_id or custom_label is required' }, { status: 400 })
  }
  if (!spanFitsWeek(body.date!, span, await getHouseholdWeekStartDay())) {
    return NextResponse.json({ error: 'Meal must end within its week' }, { status: 400 })
  }

  const { data: slot, error } = await supabase
    .from('meal_slots')
    .insert({
      household_id: householdId,
      date: body.date!,
      meal_type: 'lunch',
      recipe_id: body.recipe_id ?? null,
      custom_label: body.custom_label ?? null,
      span_days: span,
    })
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min)')
    .single()

  if (error || !slot) return NextResponse.json({ error: error?.message ?? 'Failed to create slot' }, { status: 500 })

  return NextResponse.json(slot, { status: 201 })
}
