import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { defaultLocale, isLocale, toIntlLocale, type Locale } from '@/i18n/config'
import type { Ingredient } from '@/types/recipe'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id, ui_language').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id
  const locale: Locale = isLocale(profile.ui_language) ? profile.ui_language : defaultLocale

  const body = await request.json() as { date_from: string; date_to: string; confirm_overwrite?: boolean }
  const { date_from, date_to, confirm_overwrite } = body

  if (!date_from || !date_to || !/^\d{4}-\d{2}-\d{2}$/.test(date_from) || !/^\d{4}-\d{2}-\d{2}$/.test(date_to)) {
    return NextResponse.json({ error: 'date_from and date_to are required (YYYY-MM-DD)' }, { status: 400 })
  }
  if (date_from > date_to) {
    return NextResponse.json({ error: 'date_from must be before date_to' }, { status: 400 })
  }

  // Check for existing list
  const { data: existing } = await supabase
    .from('shopping_lists')
    .select('id, name')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && !confirm_overwrite) {
    return NextResponse.json({ existing: true, list_id: existing.id, name: existing.name }, { status: 409 })
  }

  if (existing) {
    await supabase.from('shopping_lists').delete().eq('id', existing.id)
  }

  // Find week_plans whose week range overlaps with [date_from, date_to]
  // A week starting on week_start covers week_start..week_start+6
  // Overlap: week_start <= date_to AND week_start >= date_from - 6 days
  const dateFromMinus6 = new Date(date_from + 'T00:00:00')
  dateFromMinus6.setDate(dateFromMinus6.getDate() - 6)
  const dateFromMinus6Str = dateFromMinus6.toISOString().slice(0, 10)

  const { data: weekPlans } = await supabase
    .from('week_plans')
    .select('id, week_start')
    .eq('household_id', householdId)
    .gte('week_start', dateFromMinus6Str)
    .lte('week_start', date_to)

  if (!weekPlans?.length) {
    // No plans in range — create empty list
    const { data: newList, error } = await supabase
      .from('shopping_lists')
      .insert({ household_id: householdId, name: formatListName(date_from, date_to, locale), date_from, date_to })
      .select()
      .single()
    if (error || !newList) return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    return NextResponse.json({ list: newList, items: [] })
  }

  const weekPlanIds = weekPlans.map((w) => w.id)
  const weekPlanStartMap = new Map(weekPlans.map((w) => [w.id, w.week_start]))

  // Fetch all slots with recipes in those week plans
  const { data: slots } = await supabase
    .from('meal_slots')
    .select('*, recipe:recipes(id, title, servings, ingredients)')
    .in('week_plan_id', weekPlanIds)
    .not('recipe_id', 'is', null)

  // Filter slots to those whose date falls within [date_from, date_to]
  const relevantSlots = (slots ?? []).filter((slot) => {
    const weekStart = weekPlanStartMap.get(slot.week_plan_id)
    if (!weekStart) return false
    const slotDate = new Date(weekStart + 'T00:00:00')
    slotDate.setDate(slotDate.getDate() + slot.day_of_week - 1)
    const slotDateStr = slotDate.toISOString().slice(0, 10)
    return slotDateStr >= date_from && slotDateStr <= date_to
  })

  // Build shopping items from ingredients
  const rawItems: Array<{
    name: string
    quantity: number | null
    unit: string | null
    sort_order: number
    source_recipe_ids: string[]
  }> = []

  let order = 0
  for (const slot of relevantSlots) {
    const recipe = slot.recipe as unknown as { id: string; title: string; servings: number | null; ingredients: Ingredient[] } | null
    if (!recipe) continue
    const scale = Number(slot.servings_scale) || 1
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients as Ingredient[] : []

    for (const ing of ingredients) {
      rawItems.push({
        name: ing.name,
        quantity: ing.quantity != null ? Number((ing.quantity * scale).toFixed(3)) : null,
        unit: ing.unit || null,
        sort_order: order++,
        source_recipe_ids: [recipe.id],
      })
    }
  }

  // Create shopping list
  const { data: newList, error: listError } = await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, name: formatListName(date_from, date_to, locale), date_from, date_to })
    .select()
    .single()

  if (listError || !newList) return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })

  let items: unknown[] = []
  if (rawItems.length > 0) {
    const { data: insertedItems, error: itemsError } = await supabase
      .from('shopping_items')
      .insert(rawItems.map((item) => ({ ...item, shopping_list_id: newList.id })))
      .select()

    if (itemsError) return NextResponse.json({ error: 'Failed to insert items' }, { status: 500 })
    items = insertedItems ?? []
  }

  return NextResponse.json({ list: newList, items })
}

function formatListName(dateFrom: string, dateTo: string, locale: Locale): string {
  const from = new Date(dateFrom + 'T00:00:00')
  const to = new Date(dateTo + 'T00:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const intlLocale = toIntlLocale(locale)
  return `Shopping list ${from.toLocaleDateString(intlLocale, opts)} – ${to.toLocaleDateString(intlLocale, opts)}`
}
