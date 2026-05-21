import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRecipeData } from '@/lib/ai/parse-recipe'

function splitIngredients(text: string): string[] {
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

function splitSteps(text: string): string[] {
  // Numbered list: lines starting with "1." / "1)" / "Step 1:"
  if (/^\d+[.)]/m.test(text)) {
    return text
      .split(/\n(?=\d+[.)])/)
      .map((s) => s.replace(/^\d+[.)]\s*/, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  }
  // Blank-line separated paragraphs
  const paragraphs = text.split(/\n\s*\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (paragraphs.length > 1) return paragraphs
  // Fall back to line-by-line
  return text.split('\n').map((s) => s.trim()).filter(Boolean)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const body = await request.json() as { ingredients_text?: string; steps_text?: string }

  const rawIngredients = body.ingredients_text ? splitIngredients(body.ingredients_text) : []
  const rawSteps = body.steps_text ? splitSteps(body.steps_text) : []

  if (rawIngredients.length === 0 && rawSteps.length === 0) {
    return NextResponse.json({ ingredients: [], steps: [] })
  }

  const result = await parseRecipeData(rawIngredients, rawSteps, profile?.household_id ?? undefined)
  return NextResponse.json(result)
}
