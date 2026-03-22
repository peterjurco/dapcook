import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, getWeekStart, toDateString } from '@/lib/utils/week'
import { PlannerClient } from '@/components/planner/PlannerClient'

interface PlannerPageProps {
  searchParams: { week?: string }
}

export default async function PlannerPage({ searchParams }: PlannerPageProps) {
  const weekStart = searchParams.week
    ? parseWeekParam(searchParams.week)
    : await getDefaultWeek()

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Weekly Planner</h1>
        <p className="text-sm text-gray-500 mt-1">Plan your lunches for the week</p>
      </div>

      <PlannerClient weekStart={weekStart} />
    </div>
  )
}

/**
 * Returns the latest week >= current week that has at least one meal slot.
 * Falls back to the current week if none found.
 */
async function getDefaultWeek(): Promise<Date> {
  const currentWeekStart = getWeekStart()
  const currentWeekStr = toDateString(currentWeekStart)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return currentWeekStart

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()
  if (!profile?.household_id) return currentWeekStart

  // Fetch upcoming week_plans (including current week) with their slots
  const { data: weekPlans } = await supabase
    .from('week_plans')
    .select('week_start, meal_slots(id)')
    .eq('household_id', profile.household_id)
    .gte('week_start', currentWeekStr)
    .order('week_start', { ascending: false })
    .limit(10)

  const latestWithMeals = weekPlans?.find(
    (wp) => Array.isArray(wp.meal_slots) && wp.meal_slots.length > 0
  )

  return latestWithMeals ? parseWeekParam(latestWithMeals.week_start) : currentWeekStart
}
