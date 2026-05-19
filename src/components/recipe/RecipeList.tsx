'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Import, Plus } from 'lucide-react'
import { RecipeCard } from './RecipeCard'
import type { Recipe } from '@/types/database'

interface RecipeListProps {
  recipes: Recipe[]
  tagColors: Record<string, string | null>
}

export function RecipeList({ recipes, tagColors }: RecipeListProps) {
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  // Collect all unique tags across recipes
  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of recipes) {
      for (const tag of r.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([tag]) => tag)
  }, [recipes])

  const filtered = useMemo(() => {
    let result = recipes
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r) => r.title.toLowerCase().includes(q))
    }
    if (activeTag) {
      result = result.filter((r) => r.tags.includes(activeTag))
    }
    return result
  }, [recipes, search, activeTag])

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recipes</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/recipes/import"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Import size={14} />
            Import
          </Link>
          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus size={14} />
            New recipe
          </Link>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search recipes..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {allTags.map((tag) => {
            const color = tagColors[tag] ?? null
            const isActive = activeTag === tag
            return (
              <button
                key={tag}
                onClick={() => setActiveTag(isActive ? null : tag)}
                className="px-3 py-1 text-sm rounded-full border transition-colors"
                style={
                  isActive
                    ? color ? { backgroundColor: color, color: '#fff', borderColor: color } : { backgroundColor: '#111827', color: '#fff', borderColor: '#111827' }
                    : color ? { color, borderColor: color + '60', backgroundColor: color + '14' } : undefined
                }
              >
                {tag}
              </button>
            )
          })}
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} tagColors={tagColors} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">
          {recipes.length === 0 ? (
            <div>
              <p className="text-lg font-medium text-gray-500 mb-2">No recipes yet</p>
              <p className="text-sm mb-6">Import from a URL or add one manually</p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/recipes/import"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Import size={15} />
                  Import recipe
                </Link>
                <Link
                  href="/recipes/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus size={15} />
                  Add manually
                </Link>
              </div>
            </div>
          ) : (
            <p>No recipes match your search</p>
          )}
        </div>
      )}
    </div>
  )
}
