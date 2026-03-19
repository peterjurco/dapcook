import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, toDateString } from '@/lib/utils/week'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as {
    week_start: string
    day_of_week: number
    recipe_id?: string | null
    custom_label?: string | null
    span_days?: number
  }

  if (!body.week_start || !body.day_of_week) {
    return NextResponse.json({ error: 'week_start and day_of_week are required' }, { status: 400 })
  }
  if (body.day_of_week < 1 || body.day_of_week > 7) {
    return NextResponse.json({ error: 'day_of_week must be 1–7' }, { status: 400 })
  }
  if (!body.recipe_id && !body.custom_label) {
    return NextResponse.json({ error: 'recipe_id or custom_label is required' }, { status: 400 })
  }

  const weekStartStr = toDateString(parseWeekParam(body.week_start))
  const householdId = profile.household_id

  // Get or create week_plan
  let { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id')
    .eq('household_id', householdId)
    .eq('week_start', weekStartStr)
    .maybeSingle()

  if (!weekPlan) {
    const { data: created, error } = await supabase
      .from('week_plans')
      .insert({ household_id: householdId, week_start: weekStartStr })
      .select('id')
      .single()
    if (error || !created) return NextResponse.json({ error: 'Failed to create week plan' }, { status: 500 })
    weekPlan = created

    const { data: generalRules } = await supabase
      .from('planner_rules')
      .select('*')
      .eq('household_id', householdId)
      .eq('is_active', true)
    if (generalRules?.length) {
      await supabase.from('week_plan_rules').insert(
        generalRules.map((r) => ({
          week_plan_id: weekPlan!.id,
          rule_type: r.rule_type,
          label: r.label,
          config: r.config,
        }))
      )
    }
  }

  const { data: slot, error } = await supabase
    .from('meal_slots')
    .insert({
      week_plan_id: weekPlan.id,
      day_of_week: body.day_of_week,
      meal_type: 'lunch',
      recipe_id: body.recipe_id ?? null,
      custom_label: body.custom_label ?? null,
      span_days: body.span_days ?? 1,
    })
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min)')
    .single()

  if (error || !slot) return NextResponse.json({ error: error?.message ?? 'Failed to create slot' }, { status: 500 })

  return NextResponse.json(slot, { status: 201 })
}
