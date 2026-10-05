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

  const week = toDateString(weekStart)
  const [{ data }, { data: list }] = await Promise.all([
    supabase
      .from('meal_slots')
      .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings, ingredients)')
      .eq('household_id', householdId)
      .gte('date', week)
      .lte('date', toDateString(addDays(weekStart, 6)))
      .order('date'),
    // `*` so this keeps working before generated_weeks' migration has run.
    supabase
      .from('shopping_lists')
      .select('*')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const slots = (data ?? []) as unknown as PlanSlot[]
  const alreadyAdded = Array.isArray(list?.generated_weeks) && list.generated_weeks.includes(week)

  return <GenerateShoppingPage slots={slots} week={week} alreadyAdded={alreadyAdded} />
}
