'use client'

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { AlertTriangle } from 'lucide-react'
import { ShoppingItemRow } from './ShoppingItemRow'
import { Stepper } from '@/components/ui/Stepper'
import { toShoppingItem, type PlanEntry } from '@/lib/shopping/plan-entries'

const MAX_PORTIONS = 99

interface Props {
  entry: PlanEntry
  onPortionsChange: (portions: number) => void
  onToggleRemove: () => void
  onCheckIngredient: (id: string, checked: boolean) => void
  /** Receives the row's free edit text, e.g. "150g rice". */
  onEditIngredient: (id: string, text: string) => void
  onDeleteIngredient: (id: string) => void
}

export function ShoppingPlanBox({
  entry,
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
      <div className="flex items-center gap-3 p-3">
        {/* Decorative — the title next to it already names the recipe */}
        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
          {entry.imageUrl ? (
            <Image src={entry.imageUrl} alt="" width={40} height={40} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg" aria-hidden="true">🍽️</div>
          )}
        </div>
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
          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 transition-colors"
        >
          {entry.removed ? t('generate.undo') : t('generate.remove')}
        </button>
      </div>

      {!entry.removed && (
        <>
          {entry.kind === 'recipe' && (
            entry.ingredients.length > 0 ? (
              <div className="px-3 border-t border-gray-100">
                {entry.ingredients.map((ingredient, i) => {
                  const item = toShoppingItem(ingredient, entry.portions, i)
                  return (
                    <ShoppingItemRow
                      key={ingredient.id}
                      item={item}
                      recipeNames={{}}
                      onCheck={onCheckIngredient}
                      onUpdate={(id, changes) => {
                        if (changes.name !== undefined) onEditIngredient(id, changes.name)
                      }}
                      onDelete={onDeleteIngredient}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="px-3 pb-2 text-xs text-gray-400">{t('generate.noIngredients')}</p>
            )
          )}

          <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-t border-gray-100">
            {entry.kind === 'recipe' && entry.servings == null ? (
              // Icon pinned to the first line (16px line-height, 11px icon) when the text wraps
              <p className="flex items-start gap-1 text-xs text-amber-600">
                <AlertTriangle size={11} className="flex-shrink-0 mt-[2.5px]" />
                {t('generate.noServingsWarning')}
              </p>
            ) : (
              <span />
            )}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <span className="text-sm text-gray-700">{t('generate.portions')}</span>
              <Stepper
                value={entry.portions}
                min={1}
                max={MAX_PORTIONS}
                onChange={onPortionsChange}
                label={t('generate.portions')}
                decreaseLabel={t('generate.decreasePortions')}
                increaseLabel={t('generate.increasePortions')}
              />
            </div>
          </div>
        </>
      )}
    </section>
  )
}
