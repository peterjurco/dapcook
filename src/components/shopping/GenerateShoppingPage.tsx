'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { usePostHog } from 'posthog-js/react'
import { ArrowLeft } from 'lucide-react'
import { useTour } from '@/components/tour/TourProvider'
import { trackMilestone } from '@/lib/analytics/milestones'
import { formatDayLabel, parseDateString } from '@/lib/utils/week'
import {
  applyIngredientEdit,
  buildPlanEntries,
  buildSubmitPayload,
  MAX_INGREDIENTS,
  type PlanEntry,
  type PlanIngredient,
  type PlanSlot,
} from '@/lib/shopping/plan-entries'
import { ShoppingPlanBox } from './ShoppingPlanBox'

interface Props {
  slots: PlanSlot[]
  /** Week start (YYYY-MM-DD) these meals belong to. */
  week: string
  /** This week's meals are already on the list — adding again asks first. */
  alreadyAdded: boolean
}

export function GenerateShoppingPage({ slots, week, alreadyAdded: initialAlreadyAdded }: Props) {
  const router = useRouter()
  const posthog = usePostHog()
  const locale = useLocale()
  const t = useTranslations('shopping')
  const tCommon = useTranslations('common')

  const [entries, setEntries] = useState<PlanEntry[]>(() =>
    buildPlanEntries(slots, (slot) => {
      const { weekday, day } = formatDayLabel(parseDateString(slot.date)!, locale)
      return `${weekday} ${day}`
    }),
  )
  const [isAdding, setIsAdding] = useState(false)
  const [alreadyAdded, setAlreadyAdded] = useState(initialAlreadyAdded)
  const [showAddAgainConfirm, setShowAddAgainConfirm] = useState(false)
  useTour(
    'shopping-generate',
    entries.some((e) => e.kind === 'recipe' && !e.removed && e.ingredients.length > 0) && !isAdding,
  )
  const [error, setError] = useState<string | null>(null)

  const payload = buildSubmitPayload(entries)
  const itemCount = payload.ingredients.length + payload.customItems.length
  const tooManyIngredients = payload.ingredients.length > MAX_INGREDIENTS

  function updateEntry(key: string, update: (entry: PlanEntry) => PlanEntry) {
    setEntries((prev) => prev.map((e) => (e.key === key ? update(e) : e)))
  }

  function updateIngredients(key: string, update: (ingredients: PlanIngredient[], portions: number) => PlanIngredient[]) {
    updateEntry(key, (e) => (e.kind === 'recipe' ? { ...e, ingredients: update(e.ingredients, e.portions) } : e))
  }

  function updatePortions(key: string, portions: number) {
    updateEntry(key, (e) => ({ ...e, portions }))
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

  function handleAdd() {
    if (alreadyAdded) {
      setShowAddAgainConfirm(true)
      return
    }
    void submit(false)
  }

  async function submit(force: boolean) {
    setShowAddAgainConfirm(false)
    setIsAdding(true)
    setError(null)

    try {
      const res = await fetch('/api/shopping/items/add-from-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, week, force }),
      })

      // Added from another tab or device since this page loaded.
      if (res.status === 409) {
        setAlreadyAdded(true)
        setShowAddAgainConfirm(true)
        setIsAdding(false)
        return
      }

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

      trackMilestone(posthog, 'shopping_list_generated', {
        item_count: itemCount,
        recipe_count: entries.filter((e) => e.kind === 'recipe' && !e.removed).length,
        removed_recipe_count: entries.filter((e) => e.kind === 'recipe' && e.removed).length,
      })
      // Replace, not push: Back from the list must never land on this page again,
      // where one stray tap would add the whole week a second time.
      router.replace('/shopping')
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
              onPortionsChange={(portions) => updatePortions(entry.key, portions)}
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
          {tooManyIngredients && (
            <p className="text-sm text-red-500">{t('generate.tooManyItems', { max: MAX_INGREDIENTS })}</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleAdd}
            disabled={isAdding || itemCount === 0 || tooManyIngredients}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            {isAdding ? t('generate.adding') : t('generate.addToList', { count: itemCount })}
          </button>
        </div>
      </div>

      {showAddAgainConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowAddAgainConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-again-title"
            className="bg-white rounded-xl p-6 shadow-xl max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p id="add-again-title" className="text-gray-900 font-medium mb-5">{t('generate.addAgainConfirm')}</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowAddAgainConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {tCommon('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void submit(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-lg transition-colors"
              >
                {t('generate.addAgainConfirmLabel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
