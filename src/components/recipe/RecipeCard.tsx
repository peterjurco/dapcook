import Link from 'next/link'
import { Clock, Users } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { Recipe } from '@/types/database'

interface RecipeCardProps {
  recipe: Recipe
}

function formatTime(min: number | null): string | null {
  if (!min) return null
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const TAG_COLORS: Record<string, string> = {
  vegetarian: 'bg-green-100 text-green-700',
  vegan: 'bg-emerald-100 text-emerald-700',
  meat: 'bg-red-100 text-red-700',
  fish: 'bg-blue-100 text-blue-700',
  quick: 'bg-yellow-100 text-yellow-700',
  healthy: 'bg-lime-100 text-lime-700',
  soup: 'bg-orange-100 text-orange-700',
  pasta: 'bg-amber-100 text-amber-700',
}

function tagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime = (recipe.prep_time_min ?? 0) + (recipe.cook_time_min ?? 0)

  return (
    <Link href={`/recipes/${recipe.id}`} className="group block">
      <article className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md hover:border-gray-300 transition-all duration-150">
        {/* Image */}
        <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
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
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-gray-700">
            {recipe.title}
          </h3>

          {/* Tags */}
          {recipe.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {recipe.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={cn('text-xs px-2 py-0.5 rounded-full font-medium', tagColor(tag))}
                >
                  {tag}
                </span>
              ))}
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
