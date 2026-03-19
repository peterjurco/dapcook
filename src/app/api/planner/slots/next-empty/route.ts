import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWeekStart, toDateString, nextWeekStart } from '@/lib/utils/week'

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

  const body = await request.json() as { recipe_id: string; span_days?: number }
  if (!body.recipe_id) return NextResponse.json({ error: 'recipe_id is required' }, { status: 400 })

  const householdId = profile.household_id
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Search up to 3 weeks ahead for the first empty slot
  const weeksToSearch = [
    getWeekStart(today),
    nextWeekStart(getWeekStart(today)),
    nextWeekStart(nextWeekStart(getWeekStart(today))),
  ]

  const todayDay = today.getDay() === 0 ? 7 : today.getDay() // 1=Mon, 7=Sun

  for (const weekStart of weeksToSearch) {
    const weekStartStr = toDateString(weekStart)
    const isCurrentWeek = weekStartStr === toDateString(getWeekStart(today))

    const { data: weekPlan } = await supabase
      .from('week_plans')
      .select('id')
      .eq('household_id', householdId)
      .eq('week_start', weekStartStr)
      .maybeSingle()

    // Determine which days are occupied in this week
    let occupiedDays = new Set<number>()
    if (weekPlan) {
      const { data: slots } = await supabase
        .from('meal_slots')
        .select('day_of_week, span_days')
        .eq('week_plan_id', weekPlan.id)

      for (const slot of slots ?? []) {
        for (let i = 0; i < slot.span_days; i++) {
          occupiedDays.add(slot.day_of_week + i)
        }
      }
    }

    // Find first empty day (skip past days in current week)
    const startDay = isCurrentWeek ? Math.max(1, todayDay) : 1
    for (let day = startDay; day <= 7; day++) {
      if (!occupiedDays.has(day)) {
        // Create week plan if needed
        let planId = weekPlan?.id
        if (!planId) {
          const { data: created, error } = await supabase
            .from('week_plans')
            .insert({ household_id: householdId, week_start: weekStartStr })
            .select('id')
            .single()
          if (error || !created) return NextResponse.json({ error: 'Failed to create week plan' }, { status: 500 })
          planId = created.id

          const { data: generalRules } = await supabase
            .from('planner_rules')
            .select('*')
            .eq('household_id', householdId)
            .eq('is_active', true)
          if (generalRules?.length) {
            await supabase.from('week_plan_rules').insert(
              generalRules.map((r) => ({
                week_plan_id: planId!,
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
            week_plan_id: planId,
            day_of_week: day,
            meal_type: 'lunch',
            recipe_id: body.recipe_id,
            span_days: body.span_days ?? 1,
          })
          .select('*, recipe:recipes(id, title, image_url)')
          .single()

        if (error || !slot) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

        return NextResponse.json({ slot, week_start: weekStartStr }, { status: 201 })
      }
    }
  }

  return NextResponse.json({ error: 'No empty slot found in the next 3 weeks' }, { status: 409 })
}
