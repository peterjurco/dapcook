import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import { categorizeTranslationError } from '@/lib/ai/translation-error'
import { LANGUAGE_NAMES } from '@/lib/constants/languages'
import type { RecipeDraft } from '@/types/recipe'

export type ImportEvent =
  | { type: 'step'; key: string; message: string }
  | { type: 'done'; draft: RecipeDraft; translationError?: { type: string; message: string } }
  | { type: 'error'; error: string }

function encode(data: ImportEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { url?: string }
  const url = body.url?.trim()
  if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  try { new URL(url) } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ImportEvent) => controller.enqueue(encode(event))

      // Step 1: Scrape
      send({ type: 'step', key: 'scraping', message: 'Fetching recipe page...' })
      let scrapeResult: Awaited<ReturnType<typeof scrapeRecipe>>
      try {
        scrapeResult = await scrapeRecipe(url)
      } catch (err) {
        send({ type: 'error', error: err instanceof Error ? err.message : 'Failed to fetch the URL' })
        controller.close()
        return
      }

      // Step 2: Parse + household lookup in parallel
      send({ type: 'step', key: 'parsing', message: 'Reading ingredients and steps...' })
      const { raw, detectedLanguage } = scrapeResult
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
          ? supabase.from('households').select('preferred_language, preferred_units, translation_enabled').eq('id', profile.household_id).single()
          : Promise.resolve({ data: null }),
      ])

      const baseDraft: RecipeDraft = {
        ...meta,
        description: meta.description ?? '',
        tags: (meta.tags ?? []).filter(t => existingTags.has(t.toLowerCase())),
        ingredients,
        steps,
      }

      // Normalise to base language code: "en-US" → "en"
      const pageLanguage = detectedLanguage?.split('-')[0]?.toLowerCase()
      const alreadyInTargetLanguage = !!pageLanguage && pageLanguage === household?.preferred_language

      const needsTranslation = !!household?.translation_enabled && !alreadyInTargetLanguage
      const needsUnitConversion = !!household?.preferred_units

      if (!needsTranslation && !needsUnitConversion) {
        send({ type: 'done', draft: baseDraft })
        controller.close()
        return
      }

      // Step 3: Transform (translate and/or convert units)
      if (needsTranslation) {
        const langName = LANGUAGE_NAMES[household!.preferred_language] ?? household!.preferred_language
        send({ type: 'step', key: 'translating', message: `Translating to ${langName}...` })
      } else {
        send({ type: 'step', key: 'converting', message: 'Converting units...' })
      }

      try {
        const transformed = await transformRecipe(
          { title: meta.title, description: meta.description ?? null, ingredients, steps, notes: null },
          {
            targetLanguage: needsTranslation ? household!.preferred_language : undefined,
            targetUnits: household?.preferred_units,
          },
          profile?.household_id ?? undefined
        )
        send({
          type: 'done',
          draft: {
            ...baseDraft,
            title: transformed.title,
            description: transformed.description ?? baseDraft.description,
            ingredients: transformed.ingredients,
            steps: transformed.steps,
          },
        })
      } catch (err) {
        send({ type: 'done', draft: baseDraft, translationError: categorizeTranslationError(err) })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
