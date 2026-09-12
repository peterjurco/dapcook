import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import { categorizeTranslationError } from '@/lib/ai/translation-error'
import { defaultLocale, isLocale, type Locale } from '@/i18n/config'
import type { RecipeContent } from '@/lib/ai/transform-recipe'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('household_id, ui_language').eq('id', user.id).single()

  const locale: Locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale
  const t = await getTranslations({ locale, namespace: 'errors' })

  if (!profile?.household_id) {
    return NextResponse.json({ error: t('noHousehold') }, { status: 403 })
  }

  const { data: household } = await supabase
    .from('households')
    .select('preferred_language, preferred_units')
    .eq('id', profile.household_id)
    .single()

  const body = await request.json() as { content?: RecipeContent }

  if (!body.content) {
    return NextResponse.json({ error: t('contentRequired') }, { status: 400 })
  }

  try {
    const translated = await transformRecipe(
      body.content,
      {
        targetLanguage: household?.preferred_language ?? 'en',
        targetUnits: household?.preferred_units ?? 'metric',
      },
      profile.household_id
    )
    return NextResponse.json({ content: translated })
  } catch (err) {
    return NextResponse.json({ translationError: categorizeTranslationError(err) }, { status: 200 })
  }
}
