import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, getWeekStart, toDateString, type WeekStartDay } from '@/lib/utils/week'
import { PlannerClient } from '@/components/planner/PlannerClient'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId, getHouseholdWeekStartDay } from '@/lib/auth/household'

interface PlannerPageProps {
  searchParams: Promise<{ week?: string }>
}

export default async function PlannerPage(props: PlannerPageProps) {
  const searchParams = await props.searchParams;
  const startDay = await getHouseholdWeekStartDay()
  const weekStart = searchParams.week
    ? parseWeekParam(searchParams.week, startDay)
    : await getDefaultWeek(startDay)

  return (
    <div className="px-6 pt-6 pb-8 max-w-6xl mx-auto">
      <PlannerClient weekStart={weekStart} />
    </div>
  )
}

/**
 * Returns the week containing the latest meal on or after the current week;
 * falls back to the current week.
 */
async function getDefaultWeek(startDay: WeekStartDay): Promise<Date> {
  const currentWeekStart = getWeekStart(new Date(), startDay)

  const user = await getCurrentUser()
  if (!user) return currentWeekStart
  const householdId = await getCurrentHouseholdId()
  if (!householdId) return currentWeekStart

  const { data: latest } = await (await createClient())
    .from('meal_slots')
    .select('date')
    .eq('household_id', householdId)
    .gte('date', toDateString(currentWeekStart))
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()

  return latest ? parseWeekParam(latest.date, startDay) : currentWeekStart
}
