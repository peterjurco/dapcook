import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { addDays, parseWeekParam, toDateString } from '@/lib/utils/week'
import { GenerateShoppingPage } from '@/components/shopping/GenerateShoppingPage'
import type { PlanSlot } from '@/lib/shopping/plan-entries'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId, getHouseholdWeekStartDay } from '@/lib/auth/household'

interface Props {
  searchParams: { week?: string }
}

export default async function ShoppingGeneratePage({ searchParams }: Props) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const householdId = await getCurrentHouseholdId()
  if (!householdId) redirect('/planner')

  const startDay = await getHouseholdWeekStartDay()
  const weekStart = parseWeekParam(searchParams.week, startDay)

  const { data } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings, ingredients)')
    .eq('household_id', householdId)
    .gte('date', toDateString(weekStart))
    .lte('date', toDateString(addDays(weekStart, 6)))
    .order('date')
  const slots = (data ?? []) as unknown as PlanSlot[]

  return <GenerateShoppingPage slots={slots} />
}
