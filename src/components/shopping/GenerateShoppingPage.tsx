'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { ArrowLeft } from 'lucide-react'
import { getWeekDays, formatDayLabel } from '@/lib/utils/week'
import {
  applyIngredientEdit,
  buildPlanEntries,
  buildSubmitPayload,
  type PlanEntry,
  type PlanIngredient,
  type PlanSlot,
} from '@/lib/shopping/plan-entries'
import { ShoppingPlanBox } from './ShoppingPlanBox'

interface Props {
  slots: PlanSlot[]
  weekStart: Date
}

export function GenerateShoppingPage({ slots, weekStart }: Props) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('shopping')

  const [entries, setEntries] = useState<PlanEntry[]>(() => {
    const weekDays = getWeekDays(weekStart)
    return buildPlanEntries(slots, (slot) => {
      const { weekday, day } = formatDayLabel(weekDays[slot.day_of_week - 1], locale)
      return `${weekday} ${day}`
    })
  })
  // Raw text state lets the input be temporarily empty while the user is typing
  const [portionsText, setPortionsText] = useState<Record<string, string>>(() =>
    Object.fromEntries(entries.map((e) => [e.key, String(e.portions)])),
  )
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payload = buildSubmitPayload(entries)
  const itemCount = payload.ingredients.length + payload.customItems.length

  function updateEntry(key: string, update: (entry: PlanEntry) => PlanEntry) {
    setEntries((prev) => prev.map((e) => (e.key === key ? update(e) : e)))
  }

  function updateIngredients(key: string, update: (ingredients: PlanIngredient[], portions: number) => PlanIngredient[]) {
    updateEntry(key, (e) => (e.kind === 'recipe' ? { ...e, ingredients: update(e.ingredients, e.portions) } : e))
  }

  function updatePortions(key: string, raw: string) {
    setPortionsText((prev) => ({ ...prev, [key]: raw }))
    const num = parseInt(raw, 10)
    if (!isNaN(num) && num >= 1) updateEntry(key, (e) => ({ ...e, portions: num }))
  }

  function toggleRemove(key: string) {
    updateEntry(key, (e) => ({ ...e, removed: !e.removed }))
  }

  function checkIngredient(key: string, id: string, checked: boolean) {
    updateIngredients(key, (list) => list.map((i) => (i.id === id ? { ...i, checked } : i)))
  }

  function editIngredient(key: string, id: string, text: string) {
    updateIngredients(key, (list, portions) => list.map((i) => (i.id === id ? applyIngredientEdit(i, text, portions) : i)))
  }

  function deleteIngredient(key: string, id: string) {
    updateIngredients(key, (list) => list.filter((i) => i.id !== id))
  }

  async function handleAdd() {
    setIsAdding(true)
    setError(null)

    try {
      const res = await fetch('/api/shopping/items/add-from-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        setError(t('generate.genericError'))
        setIsAdding(false)
        return
      }

      // Persist recipe portions so the planner can show them next to meal names
      try {
        const saved = JSON.parse(localStorage.getItem('recipe_portions') ?? '{}') as Record<string, number>
        for (const e of entries) {
          if (e.kind === 'recipe' && !e.removed) saved[e.recipeId] = e.portions
        }
        localStorage.setItem('recipe_portions', JSON.stringify(saved))
      } catch {
        // ignore storage errors
      }

      router.push('/shopping')
    } catch {
      setError(t('generate.networkError'))
      setIsAdding(false)
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
            <ShoppingPlanBox
              key={entry.key}
              entry={entry}
              portionsText={portionsText[entry.key] ?? String(entry.portions)}
              onPortionsChange={(raw) => updatePortions(entry.key, raw)}
              onToggleRemove={() => toggleRemove(entry.key)}
              onCheckIngredient={(id, checked) => checkIngredient(entry.key, id, checked)}
              onEditIngredient={(id, text) => editIngredient(entry.key, id, text)}
              onDeleteIngredient={(id) => deleteIngredient(entry.key, id)}
            />
          ))}
        </div>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-xl mx-auto space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || itemCount === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {isAdding ? t('generate.adding') : t('generate.addToList', { count: itemCount })}
          </button>
        </div>
      </div>
    </div>
  )
}
