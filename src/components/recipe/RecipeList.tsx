'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Search, Import, Plus, SlidersHorizontal } from 'lucide-react'
import { RecipeCard } from './RecipeCard'
import { RECIPE_GRID_CLASSES } from './gridClasses'
import { RecipeFiltersModal } from './RecipeFiltersModal'
import { RecipeTagStrip } from './RecipeTagStrip'
import { useIngredientSearch } from './useIngredientSearch'
import { activeFilterCount, applyFilters, type Range } from '@/lib/recipes/filters'
import { parseFilterParams, serializeFilterParams } from '@/lib/recipes/filter-url'
import { rememberListUrl } from '@/lib/recipes/list-url-memory'
import {
  buildFilterSections,
  sanitizeDefaultFilter,
  tagColor,
  tagsByUsage,
  type Taxonomy,
} from '@/lib/tags/taxonomy'
import type { RecipeListItem } from '@/lib/recipes/list-columns'

// Search and ingredient text land in the URL once typing pauses, so each
// keystroke doesn't rewrite history.
const URL_SYNC_DEBOUNCE_MS = 300

/** Selected tags first, then the rest by usage. */
function rowOrder(selection: string[], knownTags: string[]): string[] {
  return [...selection, ...knownTags.filter((t) => !selection.includes(t))]
}

interface RecipeListProps {
  recipes: RecipeListItem[]
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
  const pathname = usePathname()
  // The state here is the source of truth and gets written back to the URL
  // (see the effects below). The URL is read on mount, and again only when
  // it changes to something this list didn't write — a navigation.
  const searchParams = useSearchParams()
  const urlQuery = searchParams?.toString() ?? ''
  const [fromUrl] = useState(() => parseFilterParams(new URLSearchParams(urlQuery)))
  // Tags in the URL mean the user picked them this visit, so they win over
  // the default view; plain /recipes still opens the default.
  const urlTags = fromUrl.tags === null ? null : sanitizeDefaultFilter(fromUrl.tags, knownTags)
  const initialSelection = urlTags ?? initialDefault
  const initialRowTags = rowOrder(initialSelection, knownTags)

  const [search, setSearch] = useState(fromUrl.search)
  const [selection, setSelection] = useState<string[]>(initialSelection)
  const [savedDefault, setSavedDefault] = useState<string[]>(initialDefault)
  const [selectionTouched, setSelectionTouched] = useState(urlTags !== null)
  const [savingDefault, setSavingDefault] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [time, setTime] = useState<Range | null>(fromUrl.time)
  const [servings, setServings] = useState<Range | null>(fromUrl.servings)
  const [ingredient, setIngredient] = useState(fromUrl.ingredient)
  const ingredientSearch = useIngredientSearch(ingredient)
  // The tag row's order is stable — it doesn't reshuffle just because a
  // visible pill got clicked. It only changes when a tag gets selected (via
  // the Filters modal, typically) that isn't currently among the tags the
  // strip is actually rendering — that tag is brought to the front, pushing
  // lower-priority tags out of the fitted width if needed.
  const [rowTags, setRowTags] = useState<string[]>(initialRowTags)
  const [visibleRowCount, setVisibleRowCount] = useState(initialRowTags.length)
  // The query this list last read from or wrote to the URL.
  const syncedQuery = useRef(urlQuery)

  const sections = buildFilterSections(recipes, taxonomy)

  const listQuery = serializeFilterParams({
    search,
    tags: selectionTouched ? selection : null,
    time,
    servings,
    ingredient,
  })

  // Mirror the filters into the URL so leaving for a recipe and coming back
  // (browser back, or the recipe page's "All recipes" link) restores them.
  // `replaceState`, not `pushState`: filter tweaks must not pile up history
  // entries, or Back would step through them instead of leaving the page.
  useEffect(() => {
    const url = listQuery ? `${pathname}?${listQuery}` : pathname
    const timer = setTimeout(() => {
      syncedQuery.current = listQuery
      if (url !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, '', url)
      }
      rememberListUrl(url)
    }, URL_SYNC_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [listQuery, pathname])

  // Navigating to the list while already on it (the bottom-nav tab opens
  // plain /recipes) keeps this component mounted and only swaps the params.
  // Anything we didn't write ourselves is a navigation: load it like a mount.
  useEffect(() => {
    if (urlQuery === syncedQuery.current) return
    syncedQuery.current = urlQuery
    const next = parseFilterParams(new URLSearchParams(urlQuery))
    const tags = next.tags === null ? null : sanitizeDefaultFilter(next.tags, knownTags)
    const nextSelection = tags ?? savedDefault
    setSearch(next.search)
    setSelection(nextSelection)
    setSelectionTouched(tags !== null)
    setTime(next.time)
    setServings(next.servings)
    setIngredient(next.ingredient)
    setRowTags(rowOrder(nextSelection, knownTags))
    // Only a URL change should trigger this; the other values are read as of then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery])

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

  function clearAllFilters() {
    setSelectionTouched(true)
    setSelection([])
    setRowTags(knownTags)
    setTime(null)
    setServings(null)
    setIngredient('')
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

  const filtered = applyFilters(
    recipes,
    { tags: effectiveSelection, time, servings, search, ingredientIds: ingredientSearch.ids },
    taxonomy
  )
  const activeCount = activeFilterCount({
    tags: selection,
    time,
    servings,
    ingredient: ingredientSearch.error ? '' : ingredient,
  })

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
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 font-fraunces flex-shrink-0">
          <span className="text-emerald-700">{t('list.headingR')}</span>{t('list.headingRest')}
        </h1>

        {/* Search — between title and actions on desktop; its own full-width
            row under them on mobile */}
        <div className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('list.searchPlaceholder')}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
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
              count={activeCount}
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
      {recipes.length > 0 && (
        // Without tags the row holds only the desktop Filters button, so on
        // mobile (where that button lives in the header) it would be empty.
        <div className={`${rowTags.length > 0 ? 'flex' : 'hidden sm:flex'} items-center gap-2 mb-6 pt-1.5 pb-1`}>
          <div className="hidden sm:block flex-shrink-0">
            <FiltersButton
              testId="filters-button-desktop"
              showLabel
              count={activeCount}
              onClick={() => setFiltersOpen(true)}
              label={t('list.filters')}
            />
          </div>
          {rowTags.length > 0 && (
            <RecipeTagStrip tags={rowTags} renderPill={renderPill} onVisibleCountChange={setVisibleRowCount} />
          )}
        </div>
      )}

      {filtersOpen && (
        <RecipeFiltersModal
          sections={sections}
          taxonomy={taxonomy}
          selection={selection}
          onToggleTag={toggleTag}
          time={time}
          onTimeChange={setTime}
          servings={servings}
          onServingsChange={setServings}
          ingredient={ingredient}
          onIngredientChange={setIngredient}
          ingredientError={ingredientSearch.error}
          onClearAll={clearAllFilters}
          activeCount={activeCount}
          resultCount={filtered.length}
          resultPending={ingredientSearch.loading}
          selectionIsDefault={selectionIsDefault}
          showDefaultAction={showDefaultAction}
          savingDefault={savingDefault}
          onToggleDefault={() => saveDefault(selectionIsDefault ? [] : selection)}
          onClose={() => setFiltersOpen(false)}
        />
      )}

      {/* Grid */}
      {filtered.length > 0 ? (
        <div className={RECIPE_GRID_CLASSES}>
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
