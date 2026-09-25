import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, getWeekStart, toDateString } from '@/lib/utils/week'
import { GenerateShoppingPage } from '@/components/shopping/GenerateShoppingPage'
import type { PlanSlot } from '@/lib/shopping/plan-entries'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'

interface Props {
  searchParams: { week?: string }
}

export default async function ShoppingGeneratePage({ searchParams }: Props) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const householdId = await getCurrentHouseholdId()
  if (!householdId) redirect('/planner')

  const weekStart = searchParams.week ? parseWeekParam(searchParams.week) : getWeekStart()
  const weekStartStr = toDateString(weekStart)

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id')
    .eq('household_id', householdId)
    .eq('week_start', weekStartStr)
    .maybeSingle()

  let slots: PlanSlot[] = []
  if (weekPlan) {
    const { data } = await supabase
      .from('meal_slots')
      .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings, ingredients)')
      .eq('week_plan_id', weekPlan.id)
      .order('day_of_week')
    slots = (data ?? []) as unknown as PlanSlot[]
  }

  return <GenerateShoppingPage slots={slots} weekStart={weekStart} />
}
