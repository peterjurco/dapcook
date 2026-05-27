import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { makeShoppingListSmart } from '@/lib/ai/make-shopping-list'
import { scaleIngredients } from '@/lib/shopping/scale-ingredients'
import type { Ingredient } from '@/types/recipe'
import type { ShoppingItem } from '@/types/database'

interface RecipeInput {
  recipe_id: string
  portions: number
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })
  const householdId = profile.household_id

  const body = await request.json() as { recipes: RecipeInput[] }
  const { recipes } = body

  if (!recipes?.length) {
    return NextResponse.json({ error: 'recipes array is required' }, { status: 400 })
  }

  const recipeIds = recipes.map((r) => r.recipe_id)

  const [{ data: recipeRows }, { data: categories }, { data: rulesRows }] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, servings, ingredients')
      .in('id', recipeIds)
      .eq('household_id', householdId),
    supabase.from('shopping_categories').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('shopping_rules').select('rule').eq('household_id', householdId).order('created_at'),
  ])

  const recipeMap = new Map(
    (recipeRows ?? []).map((r) => [r.id, r])
  )

  // Build raw items by scaling each recipe's ingredients
  const rawItems: ShoppingItem[] = []
  let order = 0

  for (const { recipe_id, portions } of recipes) {
    const recipe = recipeMap.get(recipe_id)
    if (!recipe) continue

    const ingredients = Array.isArray(recipe.ingredients)
      ? (recipe.ingredients as unknown as Ingredient[])
      : []

    const scaled = scaleIngredients(ingredients, portions, recipe.servings)

    for (const item of scaled) {
      rawItems.push({
        id: `preview-${order}`,
        shopping_list_id: 'preview',
        category: null,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        is_checked: false,
        sort_order: order,
        source_recipe_ids: [recipe_id],
      })
      order++
    }
  }

  if (!rawItems.length) {
    return NextResponse.json({ items: [], categories: [] })
  }

  const rules = (rulesRows ?? []).map((r) => r.rule)

  let result
  try {
    result = await makeShoppingListSmart(rawItems, categories ?? [], householdId, rules)
  } catch (err) {
    console.error('[shopping/preview] AI call failed:', err)
    return NextResponse.json({ error: 'AI processing failed' }, { status: 500 })
  }

  // Save AI-invented categories so they're ready for the main shopping list
  if (result.newCategories.length > 0) {
    await supabase.from('shopping_categories').insert(
      result.newCategories.map((cat) => ({
        household_id: cat.household_id,
        name: cat.name,
        color: cat.color,
        sort_order: cat.sort_order,
      }))
    )
  }

  // Return items + category metadata for the review page
  const allCategories = result.newCategories.length > 0
    ? result.newCategories
    : (categories ?? [])

  return NextResponse.json({
    items: result.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit || null,
      category: item.category || null,
    })),
    categories: allCategories.map((c) => ({ name: c.name, color: c.color })),
  })
}
