'use client'

import { useState } from 'react'
import { Trash2, GripVertical, Plus, ClipboardPaste, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { IngredientFormItem } from '@/types/recipe'
import type { Ingredient } from '@/types/recipe'

interface IngredientEditorProps {
  ingredients: IngredientFormItem[]
  onChange: (ingredients: IngredientFormItem[]) => void
}

interface SortableRowProps {
  ing: IngredientFormItem
  onUpdate: (id: string, field: keyof IngredientFormItem, value: string) => void
  onRemove: (id: string) => void
}

function SortableIngredientRow({ ing, onUpdate, onRemove }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ing.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 group">
      <GripVertical
        size={16}
        className="text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      />

      <input
        type="text"
        value={ing.quantity}
        onChange={(e) => onUpdate(ing.id, 'quantity', e.target.value)}
        placeholder="200"
        className="w-16 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 text-center"
      />

      <input
        type="text"
        value={ing.unit}
        onChange={(e) => onUpdate(ing.id, 'unit', e.target.value)}
        placeholder="g"
        className="w-20 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
      />

      <input
        type="text"
        value={ing.name}
        onChange={(e) => onUpdate(ing.id, 'name', e.target.value)}
        placeholder="chicken breast"
        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300"
      />

      <input
        type="text"
        value={ing.notes}
        onChange={(e) => onUpdate(ing.id, 'notes', e.target.value)}
        placeholder="finely chopped"
        className="w-36 px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-300 text-gray-500"
      />

      <button
        type="button"
        onClick={() => onRemove(ing.id)}
        className="p-1 text-gray-300 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        aria-label="Remove ingredient"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

export function IngredientEditor({ ingredients, onChange }: IngredientEditorProps) {
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [isParsing, setIsParsing] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
  )

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = ingredients.findIndex((i) => i.id === active.id)
    const newIndex = ingredients.findIndex((i) => i.id === over.id)
    onChange(arrayMove(ingredients, oldIndex, newIndex))
  }

  async function handleParse() {
    if (!pasteText.trim()) return
    setIsParsing(true)
    const res = await fetch('/api/recipes/parse-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients_text: pasteText }),
    })
    if (res.ok) {
      const data = await res.json() as { ingredients: Ingredient[] }
      onChange(data.ingredients.map((ing) => ({
        id: ing.id,
        quantity: ing.quantity != null ? String(ing.quantity) : '',
        unit: ing.unit ?? '',
        name: ing.name ?? '',
        notes: ing.notes ?? '',
      })))
      setPasteMode(false)
      setPasteText('')
    }
    setIsParsing(false)
  }

  if (pasteMode) {
    return (
      <div className="space-y-2">
        <textarea
          autoFocus
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder={"200g chicken breast, sliced\n1 tbsp olive oil\nsalt to taste\n2 cloves garlic, minced"}
          rows={8}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 font-mono leading-relaxed resize-y"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleParse}
            disabled={isParsing || !pasteText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isParsing ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ClipboardPaste size={14} />
            )}
            Parse
          </button>
          <button
            type="button"
            onClick={() => { setPasteMode(false); setPasteText('') }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg transition-colors"
          >
            <X size={14} />
            Cancel
          </button>
        </div>
      </div>
    )
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ingredients.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {ingredients.map((ing) => (
            <SortableIngredientRow key={ing.id} ing={ing} onUpdate={update} onRemove={remove} />
          ))}
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-3 mt-1">
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <Plus size={14} />
          Add ingredient
        </button>
        <button
          type="button"
          onClick={() => setPasteMode(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
        >
          <ClipboardPaste size={14} />
          Paste text
        </button>
      </div>
    </div>
  )
}
