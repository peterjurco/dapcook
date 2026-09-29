import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { scrapeRecipe } from '@/lib/scraper'
import { parseRecipeData } from '@/lib/ai/parse-recipe'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import { needsUnitConversion } from '@/lib/units/unit-system'
import { categorizeTranslationError } from '@/lib/ai/translation-error'
import { categorizeScrapeError } from '@/lib/scraper/scrape-error'
import { LANGUAGE_NAMES } from '@/lib/constants/languages'
import { defaultLocale } from '@/i18n/config'
import { getUserTranslations } from '@/i18n/server-utils'
import type { RecipeDraft } from '@/types/recipe'
import { loadHouseholdTagNames } from '@/lib/tags/household-tags'
import { getCurrentUser } from '@/lib/auth/current-user'

export type ImportEvent =
  | { type: 'step'; key: string; message: string }
  | { type: 'done'; draft: RecipeDraft; translationError?: { type: string; message: string } }
  | { type: 'error'; error: string }

function encode(data: ImportEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
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

      // Step 2: Household lookup, then parse
      send({ type: 'step', key: 'parsing', message: tRecipes('import.stepParsing') })
      const { raw, detectedLanguage } = scrapeResult
      const { rawIngredients, rawSteps, ...meta } = raw

      const householdId = profile?.household_id ?? undefined
      // Tags and language are needed as input to parsing (for tag suggestions), so they load first.
      const [householdTags, { data: household }] = await Promise.all([
        householdId ? loadHouseholdTagNames(supabase, householdId) : Promise.resolve([] as string[]),
        householdId
          ? supabase.from('households').select('preferred_language, preferred_units, translation_enabled').eq('id', householdId).single()
          : Promise.resolve({ data: null }),
      ])
      const existingTags = new Set(householdTags)

      const { ingredients, steps, suggestedTags } = await parseRecipeData(
        rawIngredients,
        rawSteps,
        householdId,
        household ? { title: meta.title, householdTags, language: household.preferred_language } : undefined
      )

      const baseDraft: RecipeDraft = {
        ...meta,
        description: meta.description ?? '',
        tags: (meta.tags ?? []).filter(tag => existingTags.has(tag.toLowerCase())),
        ingredients,
        steps,
        ...(suggestedTags && { suggestedTags }),
      }

      // Normalise to base language code: "en-US" → "en"
      const pageLanguage = detectedLanguage?.split('-')[0]?.toLowerCase()
      const alreadyInTargetLanguage = !!pageLanguage && pageLanguage === household?.preferred_language

      const needsTranslation = !!household?.translation_enabled && !alreadyInTargetLanguage
      // Only pay for an AI round-trip when an ingredient is actually in the other system
      const convertUnits = needsUnitConversion(ingredients, household?.preferred_units)

      if (!needsTranslation && !convertUnits) {
        send({ type: 'done', draft: baseDraft })
        controller.close()
        return
      }

      // Step 3: Transform (translate and/or convert units)
      if (needsTranslation) {
        const language = household!.preferred_language
        const languageName = LANGUAGE_NAMES[language] ?? language
        send({ type: 'step', key: 'translating', message: tRecipes('import.stepTranslating', { language, languageName }) })
      } else {
        send({ type: 'step', key: 'converting', message: tRecipes('import.stepConverting') })
      }

      try {
        const transformed = await transformRecipe(
          { title: meta.title, description: meta.description ?? null, ingredients, steps, notes: null },
          {
            targetLanguage: needsTranslation ? household!.preferred_language : undefined,
            targetUnits: convertUnits ? household!.preferred_units : undefined,
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
