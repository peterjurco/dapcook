'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { tagColor, type FilterSections, type Taxonomy } from '@/lib/tags/taxonomy'

interface RecipeFiltersModalProps {
  sections: FilterSections
  taxonomy: Taxonomy
  selection: string[]
  onToggleTag: (tag: string) => void
  onClearAll: () => void
  resultCount: number
  selectionIsDefault: boolean
  savingDefault: boolean
  onToggleDefault: () => void
  onClose: () => void
}

export function RecipeFiltersModal({
  sections,
  taxonomy,
  selection,
  onToggleTag,
  onClearAll,
  resultCount,
  selectionIsDefault,
  savingDefault,
  onToggleDefault,
  onClose,
}: RecipeFiltersModalProps) {
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
    <div className="fixed inset-0 z-50 bg-black/30 sm:flex sm:items-center sm:justify-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="fixed inset-0 bg-white flex flex-col sm:static sm:inset-auto sm:w-[560px] sm:max-h-[85vh] sm:rounded-2xl sm:shadow-xl sm:overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
          <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
          <div className="w-[18px]" />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
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
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Other</p>
              )}
              <div className="flex flex-wrap gap-2">
                {sections.ungrouped.map(renderPill)}
              </div>
            </div>
          )}

          {sections.groups.length === 0 && sections.ungrouped.length === 0 && (
            <p className="text-sm text-gray-400">No tags yet. Add some to your recipes.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClearAll}
              disabled={selection.length === 0}
              className="text-sm font-medium text-gray-900 underline hover:text-gray-600 transition-colors disabled:opacity-40 disabled:no-underline"
            >
              Clear all
            </button>
            {selection.length > 0 && (
              <button
                type="button"
                onClick={onToggleDefault}
                disabled={savingDefault}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                {selectionIsDefault ? 'Clear default' : 'Set as default'}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Show {resultCount} {resultCount === 1 ? 'recipe' : 'recipes'}
          </button>
        </div>
      </div>
    </div>
  )
}
