import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import type { RecipeDraft } from '@/types/recipe'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { url?: string }
  const url = body.url?.trim()

  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  try {
    new URL(url) // validate URL format
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  let scrapeResult: Awaited<ReturnType<typeof scrapeRecipe>>
  try {
    scrapeResult = await scrapeRecipe(url)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch the URL'
    return NextResponse.json({ error: message }, { status: 422 })
  }

  const { raw } = scrapeResult
  const { rawIngredients, rawSteps, ...meta } = raw

  const { ingredients, steps } = await parseRecipeData(rawIngredients, rawSteps)

  const draft: RecipeDraft = {
    ...meta,
    ingredients,
    steps,
  }

  return NextResponse.json(draft)
}
