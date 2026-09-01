'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, Import, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { RecipeCard } from './RecipeCard'
import {
  buildFilterSections,
  filterRecipesByTags,
  tagColor,
  type Taxonomy,
} from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

interface RecipeListProps {
  recipes: Recipe[]
  taxonomy: Taxonomy
  defaultFilter: string[]
}

export function RecipeList({ recipes, taxonomy, defaultFilter }: RecipeListProps) {
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<string[]>(defaultFilter)
  const [expanded, setExpanded] = useState(false)

  const sections = buildFilterSections(recipes, taxonomy)

  function toggleTag(tag: string) {
    setSelection((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  let filtered = filterRecipesByTags(recipes, selection, taxonomy)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((r) => r.title.toLowerCase().includes(q))
  }

  function renderPill(tag: string) {
    const color = tagColor(taxonomy, tag)
    const isActive = selection.includes(tag)
    return (
      <button
        key={tag}
        onClick={() => toggleTag(tag)}
        className="px-3 py-1 text-sm rounded-full border transition-colors"
        style={
          isActive
            ? color
              ? { backgroundColor: color, color: '#fff', borderColor: color }
              : { backgroundColor: '#111827', color: '#fff', borderColor: '#111827' }
            : color
              ? { color, borderColor: color + '60', backgroundColor: color + '14' }
              : undefined
        }
      >
        {tag}
      </button>
    )
  }

  const hasTags = sections.pinned.length > 0 || sections.rest.length > 0

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

      {/* Tag filters */}
      {hasTags && (
        <div className="mb-6">
          {sections.pinned.map((section) => (
            <div key={section.group.id} className="mb-3">
              <p className="text-xs text-gray-400 mb-1.5">{section.group.name}</p>
              <div className="flex flex-wrap gap-2">
                {section.tags.map(renderPill)}
              </div>
            </div>
          ))}

          {sections.rest.length > 0 && (
            <div className={sections.pinned.length > 0 ? 'pt-3 border-t border-gray-100' : undefined}>
              {/* Two-row clamp: pill height ~30px (py-1 text-sm) x 2 rows + 8px gap-2 = 68px.
                  Update this value if pill padding/gap classes change. */}
              <div
                data-testid="tag-area-rest"
                className={`flex flex-wrap gap-2${expanded ? '' : ' max-h-[68px] overflow-hidden'}`}
              >
                {sections.rest.map(renderPill)}
              </div>
            </div>
          )}

          {/* Action row. Lives outside the remainder block so the default-view
              action in Task 10 still appears when every tag sits in a pinned group. */}
          <div className="mt-2 flex items-center justify-between gap-3">
            {sections.rest.length > 0 ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                {expanded ? 'Show fewer tags' : 'Show all tags'}
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} taxonomy={taxonomy} />
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
