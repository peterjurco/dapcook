import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Clock, Users, Pencil, ExternalLink, ChevronLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils/cn'
import type { Recipe } from '@/types/database'
import type { Ingredient, Step } from '@/types/recipe'

interface Props {
  params: { id: string }
}

function formatTime(min: number | null, label: string) {
  if (!min) return null
  const h = Math.floor(min / 60)
  const m = min % 60
  const time = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
  return { label, time }
}

const TAG_COLORS: Record<string, string> = {
  vegetarian: 'bg-green-100 text-green-700',
  vegan: 'bg-emerald-100 text-emerald-700',
  meat: 'bg-red-100 text-red-700',
  fish: 'bg-blue-100 text-blue-700',
  quick: 'bg-yellow-100 text-yellow-700',
  healthy: 'bg-lime-100 text-lime-700',
}

function tagColor(tag: string) {
  return TAG_COLORS[tag.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
}

export default async function RecipeDetailPage({ params }: Props) {
  const supabase = createClient()

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !recipe) notFound()

  const r = recipe as Recipe
  const ingredients = (r.ingredients ?? []) as unknown as Ingredient[]
  const steps = (r.steps ?? []) as unknown as Step[]
  const totalTime = (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0)

  const times = [
    formatTime(r.prep_time_min, 'Prep'),
    formatTime(r.cook_time_min, 'Cook'),
    totalTime > 0 ? formatTime(totalTime, 'Total') : null,
  ].filter(Boolean) as { label: string; time: string }[]

  return (
    <div className="min-h-full">
      {/* Hero image */}
      {r.image_url && (
        <div className="h-72 lg:h-96 overflow-hidden bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-8">
        {/* Back + Edit */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/recipes"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ChevronLeft size={16} />
            All recipes
          </Link>
          <Link
            href={`/recipes/${r.id}/edit`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Pencil size={13} />
            Edit
          </Link>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">{r.title}</h1>

        {/* Tags */}
        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {r.tags.map((tag) => (
              <span key={tag} className={cn('text-xs px-2.5 py-1 rounded-full font-medium', tagColor(tag))}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Description */}
        {r.description && (
          <p className="mt-4 text-gray-600 leading-relaxed">{r.description}</p>
        )}

        {/* Meta bar */}
        {(times.length > 0 || r.servings) && (
          <div className="flex flex-wrap gap-6 mt-6 py-4 border-y border-gray-100">
            {times.map(({ label, time }) => (
              <div key={label} className="flex items-center gap-2">
                <Clock size={15} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="text-sm font-semibold text-gray-800">{time}</p>
                </div>
              </div>
            ))}
            {r.servings && (
              <div className="flex items-center gap-2">
                <Users size={15} className="text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Servings</p>
                  <p className="text-sm font-semibold text-gray-800">{r.servings}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Two-column layout for ingredients + steps */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-10">
          {/* Ingredients */}
          {ingredients.length > 0 && (
            <aside>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Ingredients</h2>
              <ul className="space-y-2.5">
                {ingredients.map((ing) => (
                  <li key={ing.id} className="flex gap-3 text-sm">
                    <span className="font-medium text-gray-800 min-w-[60px] text-right tabular-nums">
                      {ing.quantity !== null ? ing.quantity : ''}
                      {ing.unit ? ` ${ing.unit}` : ''}
                    </span>
                    <span className="text-gray-700">
                      {ing.name}
                      {ing.notes && <span className="text-gray-400">, {ing.notes}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {/* Steps */}
          {steps.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Method</h2>
              <ol className="space-y-6">
                {steps.map((step, index) => (
                  <li key={step.id} className="flex gap-4">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center text-xs font-bold text-white mt-0.5">
                      {index + 1}
                    </div>
                    <p className="text-gray-700 leading-relaxed pt-0.5">{step.text}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Notes */}
        {r.notes && (
          <div className="mt-10 p-4 bg-amber-50 border border-amber-100 rounded-lg">
            <p className="text-sm font-medium text-amber-800 mb-2">Notes</p>
            <div className="text-sm text-amber-700 leading-relaxed">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-2 last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-2 last:mb-0">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  a: ({ href, children }) => <a href={href} className="underline hover:text-amber-900" target="_blank" rel="noopener noreferrer">{children}</a>,
                }}
              >
                {r.notes}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Source */}
        {r.source_url && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <a
              href={r.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              <ExternalLink size={13} />
              Original recipe
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
