import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseWeekParam, getWeekStart, toDateString } from '@/lib/utils/week'
import { GenerateShoppingPage } from '@/components/shopping/GenerateShoppingPage'
import type { MealSlotWithRecipe } from '@/types/planner'

interface Props {
  searchParams: { week?: string }
}

export default async function ShoppingGeneratePage({ searchParams }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) redirect('/planner')

  const weekStart = searchParams.week ? parseWeekParam(searchParams.week) : getWeekStart()
  const weekStartStr = toDateString(weekStart)

  const { data: weekPlan } = await supabase
    .from('week_plans')
    .select('id')
    .eq('household_id', profile.household_id)
    .eq('week_start', weekStartStr)
    .maybeSingle()

  let slots: MealSlotWithRecipe[] = []
  if (weekPlan) {
    const { data } = await supabase
      .from('meal_slots')
      .select('*, recipe:recipes(id, title, image_url, cook_time_min, prep_time_min, servings)')
      .eq('week_plan_id', weekPlan.id)
      .order('day_of_week')
    slots = (data ?? []) as unknown as MealSlotWithRecipe[]
  }

  return <GenerateShoppingPage slots={slots} weekStart={weekStart} />
}
