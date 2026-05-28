'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X, AlertTriangle } from 'lucide-react'
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
}

export function GenerateShoppingPage({ slots, weekStart }: Props) {
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
    <div className="max-w-xl mx-auto px-4 py-10 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push('/planner')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Planner
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Generate shopping list</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 text-center mt-20">
          No recipes in this week&apos;s plan.{' '}
          <button type="button" onClick={() => router.push('/planner')} className="underline hover:text-gray-900">
            Go back to the planner
          </button>
        </p>
      ) : (
        <div className="space-y-3">
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
                    style={{ fontSize: '16px' }}
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
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-xl mx-auto space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || activeEntries.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {isGenerating ? 'Generating…' : `Generate shopping list`}
          </button>
        </div>
      </div>
    </div>
  )
}
