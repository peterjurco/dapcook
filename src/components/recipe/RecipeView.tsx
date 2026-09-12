import type { ReactNode } from 'react'
import { getLocale } from 'next-intl/server'
import { Clock, ExternalLink, Users } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils/cn'
import { EMPTY_TAXONOMY, tagColor, type Taxonomy } from '@/lib/tags/taxonomy'
import { formatDuration } from '@/lib/utils/format'
import type { Locale } from '@/i18n/config'
import type { Recipe } from '@/types/database'
import type { Ingredient, Step } from '@/types/recipe'

interface RecipeViewProps {
  recipe: Recipe
  toolbar?: ReactNode
  mode?: 'authenticated' | 'public'
  taxonomy?: Taxonomy
}

function formatTime(min: number | null, label: string, locale: Locale) {
  if (!min) return null
  return { label, time: formatDuration(min, locale) }
}

export async function RecipeView({ recipe: r, toolbar, mode = 'authenticated', taxonomy = EMPTY_TAXONOMY }: RecipeViewProps) {
  const locale = await getLocale()
  const ingredients = (r.ingredients ?? []) as unknown as Ingredient[]
  const steps = (r.steps ?? []) as unknown as Step[]
  const totalTime = (r.prep_time_min ?? 0) + (r.cook_time_min ?? 0)
  const times = [
    formatTime(r.prep_time_min, 'Prep', locale),
    formatTime(r.cook_time_min, 'Cook', locale),
    totalTime > 0 ? formatTime(totalTime, 'Total', locale) : null,
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
        {toolbar}

        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 leading-tight">{r.title}</h1>

        {/* Tags */}
        {r.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {r.tags.map((tag) => {
              const color = tagColor(taxonomy, tag)
              return (
                <span
                  key={tag}
                  className={cn('text-xs px-2.5 py-1 rounded-full font-medium', !color && 'bg-gray-100 text-gray-600')}
                  style={color ? { color, backgroundColor: color + '14' } : undefined}
                >
                  {tag}
                </span>
              )
            })}
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
                  a: ({ href, children }) => mode === 'public'
                    ? <span>{children}</span>
                    : <a href={href} className="underline hover:text-amber-900" target="_blank" rel="noopener noreferrer">{children}</a>,
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
