'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Clock, Users, CalendarPlus, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Recipe } from '@/types/database'

interface RecipeCardProps {
  recipe: Recipe
  tagColors: Record<string, string | null>
}

function formatTime(min: number | null): string | null {
  if (!min) return null
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function RecipeCard({ recipe, tagColors }: RecipeCardProps) {
  const totalTime = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)
  const [addState, setAddState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  async function handleAddToPlan(e: React.MouseEvent) {
    e.preventDefault() // don't navigate to recipe
    if (addState !== 'idle') return
    setAddState('loading')
    const res = await fetch('/api/planner/slots/next-empty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipe.id }),
    })
    if (res.ok) {
      setAddState('done')
      setTimeout(() => setAddState('idle'), 2000)
    } else {
      setAddState('error')
      setTimeout(() => setAddState('idle'), 2500)
    }
  }

  return (
    <Link href={`/recipes/${recipe.id}`} className="group block">
      <article className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all duration-150">
        {/* Image */}
        <div className="aspect-[4/3] bg-gray-100 overflow-hidden relative">
          {recipe.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z" />
                <path d="M12 8v4l3 3" />
              </svg>
            </div>
          )}

          {/* Add to plan button */}
          <button
            type="button"
            onClick={handleAddToPlan}
            disabled={addState === 'loading'}
            className={cn(
              'absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium shadow-sm transition-all opacity-0 group-hover:opacity-100',
              addState === 'done'
                ? 'bg-green-500 text-white opacity-100'
                : addState === 'error'
                ? 'bg-red-500 text-white opacity-100'
                : 'bg-white text-gray-700 hover:bg-gray-900 hover:text-white'
            )}
            title="Add to weekly plan"
          >
            {addState === 'loading' && <Loader2 size={11} className="animate-spin" />}
            {addState === 'done' && <Check size={11} />}
            {addState === 'error' && <span>Full</span>}
            {addState === 'idle' && <CalendarPlus size={11} />}
            {addState === 'idle' && 'Plan'}
            {addState === 'done' && 'Added'}
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-gray-700">
            {recipe.title}
          </h3>

          {/* Tags */}
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {recipe.tags.slice(0, 3).map((tag) => {
                const color = tagColors[tag] ?? null
                return (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={color
                      ? { backgroundColor: color + '28', color, borderColor: color + '60' }
                      : { backgroundColor: '#f3f4f6', color: '#4b5563' }
                    }
                  >
                    {tag}
                  </span>
                )
              })}
              {recipe.tags.length > 3 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  +{recipe.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTime(totalTime)}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users size={12} />
                {recipe.servings}
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  )
}
