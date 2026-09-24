import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { defaultLocale } from '@/i18n/config'
import { getCurrentUser } from '@/lib/auth/current-user'
import { MIN_INGREDIENT_TERM } from '@/lib/recipes/filters'
import { normalizeText } from '@/lib/utils/normalize-text'
import type { Ingredient } from '@/types/recipe'

/**
 * Ids of the household's recipes with an ingredient whose name contains `q`.
 *
 * This runs on the server because the recipe list ships without
 * `ingredients` (see RECIPE_LIST_FIELDS): the list loads on every visit, an
 * ingredient search is rare, so the rare path pays the round trip.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  const q = normalizeText((request.nextUrl.searchParams.get('q') ?? '').trim())
  if (q.length < MIN_INGREDIENT_TERM) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('queryTooShort') }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase.from('recipes').select('id, ingredients').eq('is_archived', false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (data ?? [])
    .filter((r) =>
      ((r.ingredients as unknown as Ingredient[] | null) ?? []).some((i) => normalizeText(i.name ?? '').includes(q))
    )
    .map((r) => r.id)

  return NextResponse.json({ ids })
}
