import type { Metadata } from 'next'
import { unstable_noStore as noStore } from 'next/cache'
import { notFound } from 'next/navigation'
import { RecipeView } from '@/components/recipe/RecipeView'
import { buildRecipeJsonLd } from '@/lib/recipes/recipe-json-ld'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildTagMeta, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Shared recipe | dapcook',
  robots: { index: false, follow: false },
}

interface Props {
  params: { token: string }
}

export default async function SharedRecipePage({ params }: Props) {
  noStore()

  const supabase = createAdminClient()
  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('share_token', params.token)
    .eq('is_archived', false)
    .maybeSingle()

  if (error) throw new Error('Unable to load shared recipe')
  if (!recipe) notFound()

  const typedRecipe = recipe as Recipe
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
      <RecipeView recipe={typedRecipe} mode="public" taxonomy={taxonomy} />
    </main>
  )
}
