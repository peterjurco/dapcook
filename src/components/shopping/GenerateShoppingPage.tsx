'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft, X, AlertTriangle } from 'lucide-react'
import type { MealSlotWithRecipe } from '@/types/planner'
import { CUSTOM_LABELS } from '@/types/planner'
import { getWeekDays, formatDayLabel } from '@/lib/utils/week'

interface BaseEntry {
  key: string
  title: string
  days: string[]
  portions: number
  removed: boolean
}
interface RecipeEntry extends BaseEntry {
  kind: 'recipe'
  recipeId: string
  servings: number | null
}
interface CustomEntry extends BaseEntry {
  kind: 'custom'
  name: string
}
type Entry = RecipeEntry | CustomEntry

const PRESET_LABELS = new Set<string>(CUSTOM_LABELS)

interface Props {
  slots: MealSlotWithRecipe[]
  weekStart: Date
}

export function GenerateShoppingPage({ slots, weekStart }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('shopping')
  const weekDays = getWeekDays(weekStart)

  function dayLabel(slot: MealSlotWithRecipe): string {
    const { weekday, day } = formatDayLabel(weekDays[slot.day_of_week - 1], locale)
    return `${weekday} ${day}`
  }

  // One entry per unique recipe — collect which days it appears on.
  const recipeMap = new Map<string, RecipeEntry>()
  for (const slot of slots) {
    if (!slot.recipe_id || !slot.recipe) continue
    const recipe = slot.recipe
    if (!recipeMap.has(recipe.id)) {
      recipeMap.set(recipe.id, {
        kind: 'recipe',
        key: recipe.id,
        recipeId: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        days: [],
        portions: recipe.servings ?? 1,
        removed: false,
      })
    }
    recipeMap.get(recipe.id)!.days.push(dayLabel(slot))
  }

  // One entry per unique typed custom meal — preset status labels are not shoppable.
  const customMap = new Map<string, CustomEntry>()
  for (const slot of slots) {
    if (slot.recipe_id) continue
    const label = slot.custom_label?.trim()
    if (!label || PRESET_LABELS.has(label)) continue
    if (!customMap.has(label)) {
      customMap.set(label, {
        kind: 'custom',
        key: `custom:${label}`,
        name: label,
        title: label,
        days: [],
        portions: 1,
        removed: false,
      })
    }
    customMap.get(label)!.days.push(dayLabel(slot))
  }

  const initialEntries: Entry[] = [...Array.from(recipeMap.values()), ...Array.from(customMap.values())]

  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  // Raw text state lets the input be temporarily empty while the user is typing
  const [portionsText, setPortionsText] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialEntries.map((e) => [e.key, String(e.portions)])),
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeEntries = entries.filter((e) => !e.removed)

  function updatePortions(key: string, raw: string) {
    setPortionsText((prev) => ({ ...prev, [key]: raw }))
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 1) {
      setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, portions: num } : e)))
    }
  }

  function toggleRemove(key: string) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, removed: !e.removed } : e)))
  }

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)

    const recipes = activeEntries
      .filter((e): e is RecipeEntry => e.kind === 'recipe')
      .map((e) => ({ recipe_id: e.recipeId, portions: e.portions }))
    const customItems = activeEntries
      .filter((e): e is CustomEntry => e.kind === 'custom')
      .map((e) => ({ name: e.name, portions: e.portions }))

    try {
      const res = await fetch('/api/shopping/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipes, customItems }),
      })

      if (!res.ok) {
        setError(t('generate.genericError'))
        setIsGenerating(false)
        return
      }

      const data = await res.json() as { items: unknown[]; categories: unknown[] }
      sessionStorage.setItem('shopping_preview', JSON.stringify(data))

      // Persist recipe portions so the planner can show them next to meal names
      try {
        const saved = JSON.parse(localStorage.getItem('recipe_portions') ?? '{}') as Record<string, number>
        for (const e of recipes) saved[e.recipe_id] = e.portions
        localStorage.setItem('recipe_portions', JSON.stringify(saved))
      } catch {
        // ignore storage errors
      }

      router.push('/shopping/review')
    } catch {
      setError(t('generate.networkError'))
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
          {t('generate.plannerLink')}
        </button>
        <h1 className="text-xl font-semibold text-gray-900">{t('generate.heading')}</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-500 text-center mt-20">
          {t('generate.emptyPlan')}{' '}
          <button type="button" onClick={() => router.push('/planner')} className="underline hover:text-gray-900">
            {t('generate.backToPlanner')}
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div
              key={entry.key}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                entry.removed ? 'border-gray-100 bg-gray-50 opacity-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${entry.removed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {entry.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{entry.days.join(', ')}</p>
                {entry.kind === 'recipe' && entry.servings == null && !entry.removed && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                    <AlertTriangle size={11} />
                    {t('generate.noServingsWarning')}
                  </p>
                )}
              </div>

              {/* Portions input */}
              {!entry.removed && (
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <label className="text-xs text-gray-400">{t('generate.portions')}</label>
                  <input
                    type="number"
                    min={1}
                    value={portionsText[entry.key] ?? String(entry.portions)}
                    onChange={(e) => updatePortions(entry.key, e.target.value)}
                    style={{ fontSize: '16px' }}
                    className="w-16 text-sm text-center px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                </div>
              )}

              {/* Remove / undo */}
              <button
                type="button"
                onClick={() => toggleRemove(entry.key)}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
              >
                {entry.removed ? t('generate.undo') : <X size={14} />}
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
            {isGenerating ? t('generate.generating') : t('generate.generate')}
          </button>
        </div>
      </div>
    </div>
  )
}
