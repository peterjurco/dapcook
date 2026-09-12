import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AddToPlanButton } from '@/components/recipe/AddToPlanButton'
import { RecipeView } from '@/components/recipe/RecipeView'
import { ShareRecipeButton } from '@/components/recipe/ShareRecipeButton'
import { buildTagMeta, type Taxonomy } from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

interface Props {
  params: { id: string }
}

export default async function RecipeDetailPage({ params }: Props) {
  const locale = await getLocale()
  const t = await getTranslations({ locale, namespace: 'recipes' })
  const supabase = createClient()

  const [{ data: recipe, error }, { data: tagsMeta }, { data: groups }] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', params.id).single(),
    supabase.from('tags').select('name, color, group_id'),
    supabase.from('tag_groups').select('id, name, position').order('position'),
  ])

  if (error || !recipe) notFound()

  const r = recipe as Recipe
  const taxonomy: Taxonomy = { groups: groups ?? [], tags: buildTagMeta(tagsMeta ?? []) }

  const toolbar = (
    <div className="flex items-center justify-between mb-6">
      <Link
        href="/recipes"
        aria-label="All recipes"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
      >
        <ChevronLeft size={16} />
        <span className="hidden sm:inline">All recipes</span>
      </Link>
      <div className="flex items-center gap-2">
        <AddToPlanButton recipeId={r.id} />
        <ShareRecipeButton recipeId={r.id} initialShareToken={r.share_token} />
        <Link
          href={`/recipes/${r.id}/edit`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Pencil size={13} />
          Edit
        </Link>
      </div>
    </div>
  )

  return <RecipeView recipe={r} toolbar={toolbar} taxonomy={taxonomy} locale={locale} t={t} />
}
