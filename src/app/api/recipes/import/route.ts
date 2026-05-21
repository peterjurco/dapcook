import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import { transformRecipe } from '@/lib/ai/transform-recipe'
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
    new URL(url)
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

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const { raw } = scrapeResult
  const { rawIngredients, rawSteps, ...meta } = raw

  const [{ ingredients, steps }, existingTags, { data: household }] = await Promise.all([
    parseRecipeData(rawIngredients, rawSteps, profile?.household_id ?? undefined),
    profile?.household_id
      ? Promise.all([
          supabase.from('recipes').select('tags').eq('household_id', profile.household_id).eq('is_archived', false),
          supabase.from('tags').select('name').eq('household_id', profile.household_id),
        ]).then(([{ data: recipes }, { data: tagsMeta }]) => {
          const names = new Set<string>()
          for (const r of recipes ?? []) for (const t of r.tags ?? []) names.add(t.toLowerCase())
          for (const t of tagsMeta ?? []) names.add(t.name.toLowerCase())
          return names
        })
      : Promise.resolve(new Set<string>()),
    profile?.household_id
      ? supabase.from('households').select('preferred_language, preferred_units').eq('id', profile.household_id).single()
      : Promise.resolve({ data: null }),
  ])

  const transformOptions = {
    targetLanguage: household?.preferred_language ?? 'en',
    targetUnits: household?.preferred_units ?? 'metric',
  }
  console.log('[import] household_id:', profile?.household_id)
  console.log('[import] household row:', household)
  console.log('[import] transform options:', transformOptions)

  let transformed
  try {
    transformed = await transformRecipe(
      { title: meta.title, description: meta.description ?? null, ingredients, steps, notes: null },
      transformOptions,
      profile?.household_id ?? undefined
    )
    console.log('[import] original title:', meta.title)
    console.log('[import] transformed title:', transformed.title)
  } catch (err) {
    console.error('[import] transformRecipe failed:', err)
    return NextResponse.json({ error: 'Failed to translate recipe. Please try again.' }, { status: 500 })
  }

  const draft: RecipeDraft = {
    ...meta,
    title: transformed.title,
    description: transformed.description ?? meta.description ?? '',
    tags: (meta.tags ?? []).filter(t => existingTags.has(t.toLowerCase())),
    ingredients: transformed.ingredients,
    steps: transformed.steps,
  }

  return NextResponse.json(draft)
}
