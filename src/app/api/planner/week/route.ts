import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, toDateString, addDays, daysBetween, parseDateString } from '@/lib/utils/week'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId, getHouseholdWeekStartDay } from '@/lib/auth/household'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const startDay = await getHouseholdWeekStartDay()
  const weekParam = new URL(request.url).searchParams.get('week') ?? undefined
  const weekStart = parseWeekParam(weekParam, startDay)
  const weekStartStr = toDateString(weekStart)

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

  // Slots that touch the week. A meal lasts at most 7 days, so anything that
  // reaches into the week started no more than 6 days before it.
  const weekEndStr = toDateString(addDays(weekStart, 6))
  const { data: candidates } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings)')
    .eq('household_id', householdId)
    .gte('date', toDateString(addDays(weekStart, -6)))
    .lte('date', weekEndStr)
    .order('date')
  const slots = (candidates ?? []).filter((s) => {
    const date = parseDateString(s.date)
    return date != null && daysBetween(weekStart, date) + s.span_days - 1 >= 0
  })

  // Fetch week rules
  const { data: weekRules } = await supabase
    .from('week_plan_rules')
    .select('*')
    .eq('week_plan_id', weekPlan.id)
    .order('created_at')

  return NextResponse.json({ weekPlan, slots, weekRules: weekRules ?? [] })
}
