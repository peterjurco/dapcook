'use client'

import { Trash2, GripVertical, Plus } from 'lucide-react'
import type { IngredientFormItem } from '@/types/recipe'

interface IngredientEditorProps {
  ingredients: IngredientFormItem[]
  onChange: (ingredients: IngredientFormItem[]) => void
}

export function IngredientEditor({ ingredients, onChange }: IngredientEditorProps) {
  function update(id: string, field: keyof IngredientFormItem, value: string) {
    onChange(ingredients.map((ing) => (ing.id === id ? { ...ing, [field]: value } : ing)))
  }

  function remove(id: string) {
    onChange(ingredients.filter((ing) => ing.id !== id))
  }

  function add() {
    onChange([
      ...ingredients,
      { id: crypto.randomUUID(), quantity: '', unit: '', name: '', notes: '' },
    ])
  }

  return (
    <div className="space-y-2">
      {ingredients.length > 0 && (
        <div className="grid grid-cols-[auto_64px_80px_1fr_140px_auto] gap-x-2 px-8 mb-1">
          <span />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Qty</span>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Unit</span>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Ingredient</span>
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Notes</span>
          <span />
        </div>
      )}

      {ingredients.map((ing) => (
        <div key={ing.id} className="flex items-center gap-2 group">
          <GripVertical size={16} className="text-gray-300 flex-shrink-0 cursor-grab" />

          <input
            type="text"
            value={ing.quantity}
            onChange={(e) => update(ing.id, 'quantity', e.target.value)}
            placeholder="200"
            className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 text-center"
          />

          <input
            type="text"
            value={ing.unit}
            onChange={(e) => update(ing.id, 'unit', e.target.value)}
            placeholder="g"
            className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
          />

          <input
            type="text"
            value={ing.name}
            onChange={(e) => update(ing.id, 'name', e.target.value)}
            placeholder="chicken breast"
            className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
          />

          <input
            type="text"
            value={ing.notes}
            onChange={(e) => update(ing.id, 'notes', e.target.value)}
            placeholder="finely chopped"
            className="w-36 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-500"
          />

          <button
            type="button"
            onClick={() => remove(ing.id)}
            className="p-1 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            aria-label="Remove ingredient"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mt-1"
      >
        <Plus size={14} />
        Add ingredient
      </button>
    </div>
  )
}
