import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { RecipeForm } from '@/components/recipe/RecipeForm'
import type { Recipe } from '@/types/database'

interface Props {
  params: { id: string }
}

export default async function EditRecipePage({ params }: Props) {
  const supabase = createClient()

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !recipe) notFound()

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <Link
          href={`/recipes/${params.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors mb-3"
        >
          <ChevronLeft size={16} />
          Back to recipe
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit recipe</h1>
      </div>
      <RecipeForm recipe={recipe as Recipe} />
    </div>
  )
}
