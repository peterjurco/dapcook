import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import type { Ingredient, Step } from '@/types/recipe'
import type { Json } from '@/types/database'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { targetLanguage?: string; targetUnits?: 'metric' | 'imperial' }

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const transformed = await transformRecipe(
    {
      title: recipe.title,
      description: recipe.description ?? null,
      ingredients: (recipe.ingredients as unknown as Ingredient[]) ?? [],
      steps: (recipe.steps as unknown as Step[]) ?? [],
      notes: recipe.notes ?? null,
    },
    {
      targetLanguage: body.targetLanguage,
      targetUnits: body.targetUnits,
    },
    recipe.household_id
  )

  const { data: updated, error: updateError } = await supabase
    .from('recipes')
    .update({
      title: transformed.title,
      description: transformed.description,
      ingredients: transformed.ingredients as unknown as Json,
      steps: transformed.steps as unknown as Json,
      notes: transformed.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
  }

  return NextResponse.json(updated)
}
