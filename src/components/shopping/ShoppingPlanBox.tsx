'use client'

import { useTranslations } from 'next-intl'
import { X, AlertTriangle } from 'lucide-react'
import { ShoppingItemRow } from './ShoppingItemRow'
import { toShoppingItem, type PlanEntry } from '@/lib/shopping/plan-entries'

interface Props {
  entry: PlanEntry
  /** Raw input text — may be temporarily empty while the user types. */
  portionsText: string
  onPortionsChange: (raw: string) => void
  onToggleRemove: () => void
  onCheckIngredient: (id: string, checked: boolean) => void
  /** Receives the row's free edit text, e.g. "150g rice". */
  onEditIngredient: (id: string, text: string) => void
  onDeleteIngredient: (id: string) => void
}

export function ShoppingPlanBox({
  entry, portionsText,
  onPortionsChange, onToggleRemove,
  onCheckIngredient, onEditIngredient, onDeleteIngredient,
}: Props) {
  const t = useTranslations('shopping')

  return (
    <section
      aria-label={entry.title}
      className={`rounded-xl border transition-colors ${
        entry.removed ? 'border-gray-100 bg-gray-50 opacity-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start gap-3 p-3">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${entry.removed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
            {entry.title}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{entry.days.join(', ')}</p>
        </div>
        <button
          type="button"
          onClick={onToggleRemove}
          aria-label={entry.removed ? undefined : t('generate.removeAria')}
          className="flex-shrink-0 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
        >
          {entry.removed ? t('generate.undo') : <X size={14} />}
        </button>
      </div>

      {!entry.removed && (
        <>
          {entry.kind === 'recipe' && (
            entry.ingredients.length > 0 ? (
              <div className="px-3 border-t border-gray-100">
                {entry.ingredients.map((ingredient, i) => (
                  <ShoppingItemRow
                    key={ingredient.id}
                    item={toShoppingItem(ingredient, entry.portions, i)}
                    recipeNames={{}}
                    onCheck={onCheckIngredient}
                    onUpdate={(id, changes) => {
                      if (changes.name !== undefined) onEditIngredient(id, changes.name)
                    }}
                    onDelete={onDeleteIngredient}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 pb-2 text-xs text-gray-400">{t('generate.noIngredients')}</p>
            )
          )}

          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-100">
            {entry.kind === 'recipe' && entry.servings == null ? (
              <p className="flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle size={11} />
                {t('generate.noServingsWarning')}
              </p>
            ) : (
              <span />
            )}
            <label className="flex items-center gap-2 text-xs text-gray-400">
              {t('generate.portions')}
              <input
                type="number"
                min={1}
                value={portionsText}
                onChange={(e) => onPortionsChange(e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-16 text-sm text-center text-gray-900 px-2 py-1 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </label>
          </div>
        </>
      )}
    </section>
  )
}
