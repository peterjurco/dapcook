import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { RecipeView } from '@/components/recipe/RecipeView'
import { sharedRecipeMetadata } from '@/lib/og/metadata'
import { buildRecipeJsonLd } from '@/lib/recipes/recipe-json-ld'
import { getSharedRecipe } from '@/lib/recipes/shared-recipe'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildTagMeta, type Taxonomy } from '@/lib/tags/taxonomy'

export const dynamic = 'force-dynamic'

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  noStore()
  return sharedRecipeMetadata(await getSharedRecipe(params.token))
}

export default async function SharedRecipePage({ params }: Props) {
  noStore()

  // No authenticated user here, so there's no real locale preference to
  // resolve — ambient resolution correctly falls back to English.
  const locale = await getLocale()
  const t = await getTranslations({ locale, namespace: 'recipes' })
  const typedRecipe = await getSharedRecipe(params.token)
  if (!typedRecipe) notFound()

  const supabase = createAdminClient()
  const jsonLd = buildRecipeJsonLd(typedRecipe)

  const [{ data: tagsMeta }, { data: groups }] = await Promise.all([
    supabase.from('tags').select('name, color, group_id').eq('household_id', typedRecipe.household_id),
    supabase.from('tag_groups').select('id, name, position').eq('household_id', typedRecipe.household_id).order('position'),
  ])
  const taxonomy: Taxonomy = { groups: groups ?? [], tags: buildTagMeta(tagsMeta ?? []) }

  return (
    <main className="min-h-dvh bg-gray-50 text-gray-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <RecipeView recipe={typedRecipe} mode="public" taxonomy={taxonomy} locale={locale} t={t} />
    </main>
  )
}
