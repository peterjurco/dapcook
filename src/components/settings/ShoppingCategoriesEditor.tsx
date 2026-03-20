'use client'

import { useState } from 'react'
import { X, Check, Pencil, Plus, ChevronUp, ChevronDown } from 'lucide-react'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { ShoppingCategory } from '@/types/database'

const PALETTE = [
  '#ef4444', '#f87171', '#dc2626', '#f43f5e', '#fb7185', '#be185d', '#ec4899', '#f9a8d4',
  '#f97316', '#fb923c', '#ea580c', '#f59e0b', '#fbbf24', '#eab308', '#ca8a04', '#d97706',
  '#22c55e', '#4ade80', '#16a34a', '#84cc16', '#a3e635', '#65a30d', '#10b981', '#34d399',
  '#3b82f6', '#60a5fa', '#1d4ed8', '#06b6d4', '#22d3ee', '#0891b2', '#0ea5e9', '#38bdf8',
  '#8b5cf6', '#a78bfa', '#7c3aed', '#a855f7', '#c084fc', '#9333ea', '#6366f1', '#818cf8',
  '#6b7280', '#9ca3af', '#374151', '#14b8a6', '#2dd4bf', '#0d9488', '#64748b', '#475569',
]

interface Props {
  initialCategories: ShoppingCategory[]
}

export function ShoppingCategoriesEditor({ initialCategories }: Props) {
  const [categories, setCategories] = useState<ShoppingCategory[]>(initialCategories)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  async function handleRename(id: string) {
    const newName = renameValue.trim()
    const cat = categories.find((c) => c.id === id)
    if (!newName || newName === cat?.name) { setEditingId(null); return }

    const res = await fetch(`/api/shopping/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (res.ok) {
      setCategories((prev) => prev.map((c) => c.id === id ? { ...c, name: newName } : c))
    }
    setEditingId(null)
  }

  async function handleColorChange(id: string, color: string | null) {
    const res = await fetch(`/api/shopping/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    })
    if (res.ok) {
      setCategories((prev) => prev.map((c) => c.id === id ? { ...c, color } : c))
    }
    setColorPickerFor(null)
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/shopping/categories/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setCategories((prev) => prev.filter((c) => c.id !== id))
    }
    setDeleteTarget(null)
  }

  async function handleMove(id: string, direction: 'up' | 'down') {
    const idx = categories.findIndex((c) => c.id === id)
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= categories.length) return

    const reordered = [...categories]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]

    // Update sort_order values
    const updated = reordered.map((c, i) => ({ ...c, sort_order: i }))
    setCategories(updated)

    // Persist both swapped items
    await Promise.all([
      fetch(`/api/shopping/categories/${updated[idx].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: updated[idx].sort_order }),
      }),
      fetch(`/api/shopping/categories/${updated[newIdx].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: updated[newIdx].sort_order }),
      }),
    ])
  }

  async function handleAdd() {
    const name = addName.trim()
    if (!name) return

    const res = await fetch('/api/shopping/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const created = await res.json() as ShoppingCategory
      setCategories((prev) => [...prev, created])
    }
    setAddName('')
    setAddingNew(false)
  }

  return (
    <>
      {categories.length === 0 && !addingNew && (
        <p className="text-sm text-gray-400 mb-3">
          No categories defined. AI will generate them automatically when you first use &quot;Make smarter&quot;.
        </p>
      )}

      <div className="space-y-1">
        {categories.map((cat, idx) => (
          <div key={cat.id} className="flex items-center gap-2 py-1.5 group">
            {/* Up/down reorder */}
            <div className="flex flex-col gap-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => handleMove(cat.id, 'up')}
                disabled={idx === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-0"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => handleMove(cat.id, 'down')}
                disabled={idx === categories.length - 1}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-0"
              >
                <ChevronDown size={12} />
              </button>
            </div>

            {/* Color dot */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setColorPickerFor(colorPickerFor === cat.id ? null : cat.id)}
                className="w-5 h-5 rounded-full border border-gray-200 hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all flex-shrink-0"
                style={{ backgroundColor: cat.color ?? '#e5e7eb' }}
                title="Change color"
              />
              {colorPickerFor === cat.id && (
                <div className="absolute z-10 top-7 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex flex-wrap gap-1.5 w-56">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleColorChange(cat.id, c)}
                      className="w-6 h-6 rounded-full hover:scale-110 transition-transform relative"
                      style={{ backgroundColor: c }}
                    >
                      {cat.color === c && (
                        <Check size={12} className="absolute inset-0 m-auto text-white" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                  {cat.color && (
                    <button
                      type="button"
                      onClick={() => handleColorChange(cat.id, null)}
                      className="w-6 h-6 rounded-full border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
                      title="Remove color"
                    >
                      <X size={10} className="text-gray-400" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Name / rename input */}
            {editingId === cat.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(cat.id)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onBlur={() => handleRename(cat.id)}
                className="flex-1 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            ) : (
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm text-gray-900 font-medium" style={cat.color ? { color: cat.color } : undefined}>
                  {cat.name}
                </span>
                <button
                  type="button"
                  onClick={() => { setEditingId(cat.id); setRenameValue(cat.name) }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700"
                  title="Rename"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={() => setDeleteTarget(cat.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 flex-shrink-0"
              title="Delete"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Add new */}
      {addingNew ? (
        <div className="flex items-center gap-2 mt-2">
          <input
            autoFocus
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAddingNew(false); setAddName('') }
            }}
            placeholder="Category name"
            className="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setAddingNew(false); setAddName('') }}
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingNew(true)}
          className="mt-3 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <Plus size={14} />
          Add category
        </button>
      )}

      {deleteTarget && (
        <ConfirmModal
          message={`Delete category "${categories.find((c) => c.id === deleteTarget)?.name}"? Items with this category will remain but become uncategorized.`}
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
