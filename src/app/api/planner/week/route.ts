import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, toDateString } from '@/lib/utils/week'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const weekParam = new URL(request.url).searchParams.get('week') ?? undefined
  const weekStart = parseWeekParam(weekParam)
  const weekStartStr = toDateString(weekStart)
  const householdId = profile.household_id

  // Get or create week_plan
  let { data: weekPlan } = await supabase
    .from('week_plans')
    .select('*')
    .eq('household_id', householdId)
    .eq('week_start', weekStartStr)
    .maybeSingle()

  if (!weekPlan) {
    const { data: created, error } = await supabase
      .from('week_plans')
      .insert({ household_id: householdId, week_start: weekStartStr })
      .select()
      .single()
    if (error || !created) return NextResponse.json({ error: 'Failed to create week plan' }, { status: 500 })
    weekPlan = created

    // Copy active general rules into this week's rules
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

  // Fetch slots with recipe data
  const { data: slots } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings)')
    .eq('week_plan_id', weekPlan.id)
    .order('day_of_week')

  // Fetch week rules
  const { data: weekRules } = await supabase
    .from('week_plan_rules')
    .select('*')
    .eq('week_plan_id', weekPlan.id)
    .order('created_at')

  return NextResponse.json({ weekPlan, slots: slots ?? [], weekRules: weekRules ?? [] })
}
