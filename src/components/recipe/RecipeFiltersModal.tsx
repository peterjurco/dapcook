'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { tagColor, type FilterSections, type Taxonomy } from '@/lib/tags/taxonomy'
import { RangeFilter } from './RangeFilter'
import { SERVINGS_PRESETS, TIME_PRESETS, type Range } from '@/lib/recipes/filters'

interface RecipeFiltersModalProps {
  sections: FilterSections
  taxonomy: Taxonomy
  selection: string[]
  onToggleTag: (tag: string) => void
  time: Range | null
  onTimeChange: (next: Range | null) => void
  servings: Range | null
  onServingsChange: (next: Range | null) => void
  ingredient: string
  onIngredientChange: (next: string) => void
  ingredientError: boolean
  onClearAll: () => void
  activeCount: number
  resultCount: number
  /** The ingredient search is still running, so `resultCount` may be stale. */
  resultPending: boolean
  selectionIsDefault: boolean
  showDefaultAction: boolean
  savingDefault: boolean
  onToggleDefault: () => void
  onClose: () => void
}

export function RecipeFiltersModal({
  sections,
  taxonomy,
  selection,
  onToggleTag,
  time,
  onTimeChange,
  servings,
  onServingsChange,
  ingredient,
  onIngredientChange,
  ingredientError,
  onClearAll,
  activeCount,
  resultCount,
  resultPending,
  selectionIsDefault,
  showDefaultAction,
  savingDefault,
  onToggleDefault,
  onClose,
}: RecipeFiltersModalProps) {
  const t = useTranslations('recipes')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function renderPill(tag: string) {
    const color = tagColor(taxonomy, tag)
    const isActive = selection.includes(tag)
    return (
      <button
        key={tag}
        type="button"
        onClick={() => onToggleTag(tag)}
        className="px-3 py-1.5 text-sm rounded-full border transition-colors"
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
    // z-[60]: above the mobile bottom nav in AppShell (z-50), which otherwise
    // paints over this full-screen sheet's footer.
    <div className="fixed inset-0 z-[60] bg-black/30 sm:flex sm:items-center sm:justify-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('filtersModal.dialogAria')}
        className="fixed inset-0 bg-white flex flex-col sm:static sm:inset-auto sm:w-[560px] sm:max-h-[85vh] sm:rounded-2xl sm:shadow-xl sm:overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('filtersModal.closeAria')}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
          <h2 className="text-sm font-semibold text-gray-900">{t('filtersModal.heading')}</h2>
          <div className="w-[18px]" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <div>
            <label
              htmlFor="filter-ingredient"
              className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2"
            >
              {t('filtersModal.ingredient')}
            </label>
            <input
              id="filter-ingredient"
              type="text"
              value={ingredient}
              onChange={(e) => onIngredientChange(e.target.value)}
              placeholder={t('filtersModal.ingredientPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
            {ingredientError && <p className="mt-1 text-xs text-red-600">{t('filtersModal.ingredientError')}</p>}
          </div>

          <RangeFilter label={t('filtersModal.totalTime')} presets={TIME_PRESETS} value={time} onChange={onTimeChange} />
          <RangeFilter label={t('filtersModal.servings')} presets={SERVINGS_PRESETS} value={servings} onChange={onServingsChange} />

          {sections.groups.map((section) => (
            <div key={section.group.id}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {section.group.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {section.tags.map(renderPill)}
              </div>
            </div>
          ))}

          {sections.ungrouped.length > 0 && (
            <div>
              {sections.groups.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('filtersModal.other')}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {sections.ungrouped.map(renderPill)}
              </div>
            </div>
          )}

          {sections.groups.length === 0 && sections.ungrouped.length === 0 && (
            <p className="text-sm text-gray-400">{t('filtersModal.noTags')}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClearAll}
              disabled={activeCount === 0}
              className="text-sm font-medium text-gray-900 underline hover:text-gray-600 transition-colors disabled:opacity-40 disabled:no-underline"
            >
              {t('filtersModal.clearAll')}
            </button>
            {showDefaultAction && (
              <button
                type="button"
                onClick={onToggleDefault}
                disabled={savingDefault}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                {selectionIsDefault ? t('filtersModal.clearDefault') : t('filtersModal.setAsDefault')}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-busy={resultPending}
            className={`px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-opacity ${resultPending ? 'opacity-60' : ''}`}
          >
            {t('filtersModal.showResults', { count: resultCount })}
          </button>
        </div>
      </div>
    </div>
  )
}
