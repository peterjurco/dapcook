'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import type { Recipe } from '@/types/database'
import { CUSTOM_LABELS } from '@/types/planner'

interface RecipeSearchProps {
  onSelectRecipe: (recipe: Recipe) => void
  onSelectCustom: (label: string) => void
  onClose: () => void
}

export function RecipeSearch({ onSelectRecipe, onSelectCustom, onClose }: RecipeSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [onClose])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      const res = await fetch(`/api/recipes?search=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(Array.isArray(data) ? data : [])
      setLoading(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div ref={containerRef} className="absolute z-20 top-0 left-0 w-56 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <Search size={14} className="text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recipes…"
          className="flex-1 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      {/* Custom labels */}
      {!query && (
        <div className="p-2 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 px-2 mb-1">Quick labels</p>
          <div className="flex flex-wrap gap-1.5 px-1">
            {CUSTOM_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => onSelectCustom(label)}
                className="text-xs px-3 py-1 rounded-full bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div className="max-h-56 overflow-y-auto">
        {loading && (
          <p className="text-xs text-gray-400 px-4 py-3">Searching…</p>
        )}
        {!loading && query && results.length === 0 && (
          <p className="text-xs text-gray-400 px-4 py-3">No recipes found</p>
        )}
        {results.map((recipe) => (
          <button
            key={recipe.id}
            type="button"
            onClick={() => onSelectRecipe(recipe)}
            className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-md bg-gray-100 flex-shrink-0 overflow-hidden">
              {recipe.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200" />
              )}
            </div>
            <span className="text-sm text-gray-900 line-clamp-1">{recipe.title}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
