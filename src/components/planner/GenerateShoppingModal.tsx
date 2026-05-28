'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import type { MealSlotWithRecipe } from '@/types/planner'
import { getWeekDays, formatDayLabel } from '@/lib/utils/week'

interface RecipeEntry {
  recipeId: string
  title: string
  servings: number | null
  days: string[]
  portions: number
  removed: boolean
}

interface Props {
  slots: MealSlotWithRecipe[]
  weekStart: Date
  onClose: () => void
}

export function GenerateShoppingModal({ slots, weekStart, onClose }: Props) {
  const router = useRouter()
  const weekDays = getWeekDays(weekStart)

  // Build one entry per unique recipe — collect which days it appears on
  const recipeMap = new Map<string, RecipeEntry>()
  for (const slot of slots) {
    if (!slot.recipe_id || !slot.recipe) continue
    const recipe = slot.recipe
    if (!recipeMap.has(recipe.id)) {
      recipeMap.set(recipe.id, {
        recipeId: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        days: [],
        portions: recipe.servings ?? 1,
        removed: false,
      })
    }
    const dayDate = weekDays[slot.day_of_week - 1]
    const { weekday, day } = formatDayLabel(dayDate)
    recipeMap.get(recipe.id)!.days.push(`${weekday} ${day}`)
  }

  const [entries, setEntries] = useState<RecipeEntry[]>(Array.from(recipeMap.values()))
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeEntries = entries.filter((e) => !e.removed)

  function updatePortions(recipeId: string, value: string) {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 1) return
    setEntries((prev) =>
      prev.map((e) => (e.recipeId === recipeId ? { ...e, portions: num } : e))
    )
  }

  function toggleRemove(recipeId: string) {
    setEntries((prev) =>
      prev.map((e) => (e.recipeId === recipeId ? { ...e, removed: !e.removed } : e))
    )
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)

    const payload = activeEntries.map((e) => ({
      recipe_id: e.recipeId,
      portions: e.portions,
    }))

    try {
      const res = await fetch('/api/shopping/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipes: payload }),
      })

      if (!res.ok) {
        setError('Something went wrong. Please try again.')
        setIsGenerating(false)
        return
      }

      const data = await res.json() as { items: unknown[]; categories: unknown[] }
      sessionStorage.setItem('shopping_preview', JSON.stringify(data))

      // Persist portions so the planner can show them next to meal names
      try {
        const saved = JSON.parse(localStorage.getItem('recipe_portions') ?? '{}') as Record<string, number>
        for (const e of activeEntries) saved[e.recipeId] = e.portions
        localStorage.setItem('recipe_portions', JSON.stringify(saved))
      } catch {
        // ignore storage errors
      }

      router.push('/shopping/review')
    } catch {
      setError('Network error. Please try again.')
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pb-16 sm:pb-0">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Generate shopping list</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Recipe list */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
          {entries.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">
              No recipes in this week&apos;s plan.
            </p>
          )}
          {entries.map((entry) => (
            <div
              key={entry.recipeId}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                entry.removed
                  ? 'border-gray-100 bg-gray-50 opacity-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${entry.removed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {entry.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{entry.days.join(', ')}</p>
                {entry.servings == null && !entry.removed && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <AlertTriangle size={11} />
                    No servings defined — using 1
                  </p>
                )}
              </div>

              {/* Portions input */}
              {!entry.removed && (
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <label className="text-xs text-gray-400">Portions</label>
                  <input
                    type="number"
                    min={1}
                    value={entry.portions}
                    onChange={(e) => updatePortions(entry.recipeId, e.target.value)}
                    className="w-16 text-sm text-center px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              )}

              {/* Remove / undo */}
              <button
                type="button"
                onClick={() => toggleRemove(entry.recipeId)}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
              >
                {entry.removed ? 'Undo' : <X size={14} />}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || activeEntries.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
