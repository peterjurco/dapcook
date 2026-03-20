'use client'

import { useState, useRef } from 'react'
import { X, Pencil, Check, Info } from 'lucide-react'
import type { ShoppingItem, ShoppingCategory } from '@/types/database'

interface Props {
  item: ShoppingItem
  categories: ShoppingCategory[]
  recipeNames: Record<string, string>
  onCheck: (id: string, checked: boolean) => void
  onUpdate: (id: string, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>>) => void
  onDelete: (id: string) => void
}

export function ShoppingItemRow({ item, categories, recipeNames, onCheck, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)
  const [editQty, setEditQty] = useState(item.quantity != null ? String(item.quantity) : '')
  const [editUnit, setEditUnit] = useState(item.unit ?? '')
  const [editCategory, setEditCategory] = useState(item.category ?? '')
  const saveRef = useRef(false)

  function startEdit() {
    setEditName(item.name)
    setEditQty(item.quantity != null ? String(item.quantity) : '')
    setEditUnit(item.unit ?? '')
    setEditCategory(item.category ?? '')
    setEditing(true)
  }

  function save() {
    if (saveRef.current) return
    saveRef.current = true
    const qty = editQty !== '' ? parseFloat(editQty) : null
    onUpdate(item.id, {
      name: editName.trim() || item.name,
      quantity: isNaN(qty as number) ? null : qty,
      unit: editUnit.trim() || null,
      category: editCategory.trim() || null,
    })
    setEditing(false)
    setTimeout(() => { saveRef.current = false }, 100)
  }

  function cancel() {
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5 px-1">
        <div className="w-4 flex-shrink-0" />
        <input
          autoFocus
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className="flex-1 min-w-0 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Item name"
        />
        <input
          value={editQty}
          onChange={(e) => setEditQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className="w-16 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Qty"
          type="number"
          step="any"
        />
        <input
          value={editUnit}
          onChange={(e) => setEditUnit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className="w-16 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
          placeholder="Unit"
        />
        {categories.length > 0 && (
          <select
            value={editCategory}
            onChange={(e) => setEditCategory(e.target.value)}
            className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300 max-w-[120px]"
          >
            <option value="">Other</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        )}
        <button type="button" onClick={save} className="text-gray-500 hover:text-gray-900 flex-shrink-0">
          <Check size={14} />
        </button>
        <button type="button" onClick={cancel} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
          <X size={14} />
        </button>
      </div>
    )
  }

  const qtyDisplay = item.quantity != null
    ? `${formatQty(item.quantity)}${item.unit ?? ''}`
    : item.unit ?? null

  return (
    <div className="flex items-center gap-3 py-1.5 px-1 group">
      <input
        type="checkbox"
        checked={item.is_checked}
        onChange={(e) => onCheck(item.id, e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-gray-900 cursor-pointer flex-shrink-0"
      />
      <span className={`flex-1 min-w-0 text-sm ${item.is_checked ? 'line-through text-gray-400' : 'text-gray-900'}`}>
        {qtyDisplay && (
          <span className="text-gray-500 mr-1.5">{qtyDisplay}</span>
        )}
        {item.name}
      </span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {item.source_recipe_ids.length > 0 && (
          <div className="relative group/tooltip">
            <Info size={12} className="text-gray-300 cursor-default" />
            <div className="absolute z-20 bottom-full right-0 mb-1.5 hidden group-hover/tooltip:block">
              <div className="bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 w-max max-w-[180px] break-words">
                {item.source_recipe_ids.map((id) => recipeNames[id] ?? 'Unknown recipe').join(', ')}
                <div className="absolute top-full right-2 border-4 border-transparent border-t-gray-900" />
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={startEdit}
          className="text-gray-400 hover:text-gray-700"
          title="Edit"
        >
          <Pencil size={12} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="text-gray-300 hover:text-red-500"
          title="Delete"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

function formatQty(qty: number): string {
  // Show as integer if whole, otherwise up to 3 significant decimal places
  if (Number.isInteger(qty)) return String(qty)
  const rounded = parseFloat(qty.toPrecision(3))
  return String(rounded)
}
