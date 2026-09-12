'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search, Import, Plus, SlidersHorizontal } from 'lucide-react'
import { RecipeCard } from './RecipeCard'
import { RecipeFiltersModal } from './RecipeFiltersModal'
import { RecipeTagStrip } from './RecipeTagStrip'
import {
  buildFilterSections,
  filterRecipesByTags,
  sanitizeDefaultFilter,
  tagColor,
  tagsByUsage,
  type Taxonomy,
} from '@/lib/tags/taxonomy'
import type { Recipe } from '@/types/database'

interface RecipeListProps {
  recipes: Recipe[]
  taxonomy: Taxonomy
  defaultFilter: string[]
}

function FiltersButton({
  testId,
  showLabel,
  count,
  onClick,
  label,
}: {
  testId: string
  showLabel: boolean
  count: number
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="relative inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-full hover:bg-gray-50 transition-colors flex-shrink-0"
    >
      <SlidersHorizontal size={14} />
      {showLabel && label}
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center text-[10px] font-semibold bg-gray-900 text-white rounded-full">
          {count}
        </span>
      )}
    </button>
  )
}

export function RecipeList({ recipes, taxonomy, defaultFilter }: RecipeListProps) {
  const t = useTranslations('recipes')
  const knownTags = tagsByUsage(recipes)
  const initialDefault = sanitizeDefaultFilter(defaultFilter, knownTags)
  const initialRowTags = [...initialDefault, ...knownTags.filter((t) => !initialDefault.includes(t))]

  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<string[]>(initialDefault)
  const [savedDefault, setSavedDefault] = useState<string[]>(initialDefault)
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  // The tag row's order is stable — it doesn't reshuffle just because a
  // visible pill got clicked. It only changes when a tag gets selected (via
  // the Filters modal, typically) that isn't currently among the tags the
  // strip is actually rendering — that tag is brought to the front, pushing
  // lower-priority tags out of the fitted width if needed.
  const [rowTags, setRowTags] = useState<string[]>(initialRowTags)
  const [visibleRowCount, setVisibleRowCount] = useState(initialRowTags.length)

  const sections = buildFilterSections(recipes, taxonomy)

  function toggleTag(tag: string) {
    setSelectionTouched(true)
    const isSelecting = !selection.includes(tag)
    setSelection((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )

    if (isSelecting) {
      const currentlyVisible = rowTags.slice(0, visibleRowCount)
      if (!currentlyVisible.includes(tag)) {
        setRowTags((prev) => [tag, ...prev.filter((t) => t !== tag)])
      }
    }
  }

  function clearAllTags() {
    setSelectionTouched(true)
    setSelection([])
    setRowTags(knownTags)
  }

  const searching = search.trim().length > 0
  // A search must never be narrowed by a default the user did not choose for
  // this visit. Once they change the selection themselves, it is theirs and applies.
  const defaultBypassed = searching && !selectionTouched && initialDefault.length > 0
  const effectiveSelection = defaultBypassed ? [] : selection

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v) => b.includes(v))
  const selectionIsDefault = sameSet(selection, savedDefault)
  // Show the default action whenever there's something to set OR something
  // to clear — not just when a selection is active. Otherwise clearing your
  // selection to save "no filter" as the new default has no button to press.
  const showDefaultAction = selection.length > 0 || savedDefault.length > 0

  async function saveDefault(next: string[]) {
    setSavingDefault(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ default_recipe_filter: next }),
    })
    if (res.ok) setSavedDefault(next)
    setSavingDefault(false)
  }

  let filtered = filterRecipesByTags(recipes, effectiveSelection, taxonomy)
  if (searching) {
    const q = search.toLowerCase()
    filtered = filtered.filter((r) => r.title.toLowerCase().includes(q))
  }

  function renderPill(tag: string) {
    const color = tagColor(taxonomy, tag)
    const isActive = selection.includes(tag)
    return (
      <button
        key={tag}
        type="button"
        onClick={() => toggleTag(tag)}
        className="px-3 py-1 text-sm rounded-full border transition-colors flex-shrink-0"
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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-fraunces flex-shrink-0">
          <span className="text-emerald-700">{t('list.headingR')}</span>{t('list.headingRest')}
        </h1>

        {/* Search — desktop only */}
        <div className="relative flex-1 max-w-md hidden sm:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/recipes/import"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Import size={14} />
            {t('list.import')}
          </Link>
          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">{t('list.newRecipe')}</span>
            <span className="sm:hidden">{t('list.new')}</span>
          </Link>
          {/* Filters — mobile only, grouped with the other action buttons
              on the right rather than floating between title and them */}
          <div className="sm:hidden">
            <FiltersButton
              testId="filters-button-mobile"
              showLabel={false}
              count={selection.length}
              onClick={() => setFiltersOpen(true)}
              label={t('list.filters')}
            />
          </div>
        </div>
      </div>

      {defaultBypassed && (
        <p className="text-xs text-gray-400 mb-3">{t('list.searchingAllNotice')}</p>
      )}

      {/* Tag row — as many pills as fit on one line, no scrolling. The
          Filters button lives outside RecipeTagStrip's own container so its
          badge (which pokes outside the button via negative offset) is
          never clipped by anything. */}
      {rowTags.length > 0 && (
        <div className="flex items-center gap-2 mb-6 pt-1.5 pb-1">
          <div className="hidden sm:block flex-shrink-0">
            <FiltersButton
              testId="filters-button-desktop"
              showLabel
              count={selection.length}
              onClick={() => setFiltersOpen(true)}
              label={t('list.filters')}
            />
          </div>
          <RecipeTagStrip tags={rowTags} renderPill={renderPill} onVisibleCountChange={setVisibleRowCount} />
        </div>
      )}

      {filtersOpen && (
        <RecipeFiltersModal
          sections={sections}
          taxonomy={taxonomy}
          selection={selection}
          onToggleTag={toggleTag}
          onClearAll={clearAllTags}
          resultCount={filtered.length}
          selectionIsDefault={selectionIsDefault}
          showDefaultAction={showDefaultAction}
          savingDefault={savingDefault}
          onToggleDefault={() => saveDefault(selectionIsDefault ? [] : selection)}
          onClose={() => setFiltersOpen(false)}
        />
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
              <p className="text-lg font-medium text-gray-500 mb-2">{t('list.emptyHeading')}</p>
              <p className="text-sm mb-6">{t('list.emptySubtitle')}</p>
              <div className="flex justify-center gap-3">
                <Link
                  href="/recipes/import"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Import size={15} />
                  {t('list.importRecipe')}
                </Link>
                <Link
                  href="/recipes/new"
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus size={15} />
                  {t('list.addManually')}
                </Link>
              </div>
            </div>
          ) : (
            <p>{t('list.noMatch')}</p>
          )}
        </div>
      )}
    </div>
  )
}
