import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import { categorizeTranslationError } from '@/lib/ai/translation-error'
import { categorizeScrapeError } from '@/lib/scraper/scrape-error'
import { LANGUAGE_NAMES } from '@/lib/constants/languages'
import { defaultLocale } from '@/i18n/config'
import { getUserTranslations } from '@/i18n/server-utils'
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
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('household_id, ui_language').eq('id', user.id).single()

  const t = await getUserTranslations(profile, 'errors')
  const tRecipes = await getUserTranslations(profile, 'recipes')

  const body = await request.json() as { url?: string }
  const url = body.url?.trim()
  if (!url) return NextResponse.json({ error: t('urlRequired') }, { status: 400 })
  try { new URL(url) } catch {
    return NextResponse.json({ error: t('invalidUrl') }, { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ImportEvent) => controller.enqueue(encode(event))

      // Step 1: Scrape
      send({ type: 'step', key: 'scraping', message: tRecipes('import.stepScraping') })
      let scrapeResult: Awaited<ReturnType<typeof scrapeRecipe>>
      try {
        scrapeResult = await scrapeRecipe(url, {
          householdId: profile?.household_id ?? undefined,
          onExtracting: () => send({ type: 'step', key: 'extracting', message: tRecipes('import.stepExtracting') }),
        })
      } catch (err) {
        send({ type: 'error', error: categorizeScrapeError(err, t).message })
        controller.close()
        return
      }

      // Step 2: Parse + household lookup in parallel
      send({ type: 'step', key: 'parsing', message: tRecipes('import.stepParsing') })
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
              for (const r of recipes ?? []) for (const tag of r.tags ?? []) names.add(tag.toLowerCase())
              for (const tagRow of tagsMeta ?? []) names.add(tagRow.name.toLowerCase())
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
        tags: (meta.tags ?? []).filter(tag => existingTags.has(tag.toLowerCase())),
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
        send({ type: 'step', key: 'translating', message: tRecipes('import.stepTranslating', { language: langName }) })
      } else {
        send({ type: 'step', key: 'converting', message: tRecipes('import.stepConverting') })
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
