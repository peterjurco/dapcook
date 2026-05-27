'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2, Check, X } from 'lucide-react'

interface PreviewItem {
  name: string
  quantity: number | null
  unit: string | null
  category: string | null
}

interface PreviewCategory {
  name: string
  color: string | null
}

interface PreviewData {
  items: PreviewItem[]
  categories: PreviewCategory[]
}

interface GroupedItems {
  category: string
  color: string | null
  items: { item: PreviewItem; index: number }[]
}

function groupItems(items: PreviewItem[], categories: PreviewCategory[]): GroupedItems[] {
  const categoryOrder = new Map(categories.map((c, i) => [c.name, i]))
  const colorMap = new Map(categories.map((c) => [c.name, c.color]))

  const indexed = items.map((item, index) => ({ item, index }))
  indexed.sort((a, b) => {
    const ai = a.item.category ? (categoryOrder.get(a.item.category) ?? 999) : 999
    const bi = b.item.category ? (categoryOrder.get(b.item.category) ?? 999) : 999
    if (ai !== bi) return ai - bi
    return a.item.name.localeCompare(b.item.name)
  })

  const groups = new Map<string, { item: PreviewItem; index: number }[]>()
  for (const entry of indexed) {
    const cat =
      entry.item.category && categoryOrder.has(entry.item.category)
        ? entry.item.category
        : 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(entry)
  }

  return Array.from(groups.entries()).map(([category, groupItems]) => ({
    category,
    color: colorMap.get(category) ?? null,
    items: groupItems,
  }))
}

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(parseFloat(qty.toPrecision(3)))
}

export function ShoppingReviewClient() {
  const router = useRouter()
  const [items, setItems] = useState<PreviewItem[]>([])
  const [categories, setCategories] = useState<PreviewCategory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editQty, setEditQty] = useState('')
  const [editUnit, setEditUnit] = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('shopping_preview')
    if (raw) {
      try {
        const data = JSON.parse(raw) as PreviewData
        setItems(data.items)
        setCategories(data.categories)
      } catch {
        // malformed — treat as empty
      }
    }
    setLoaded(true)
  }, [])

  function handleDelete(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function startEdit(index: number) {
    const item = items[index]
    setEditingIndex(index)
    setEditName(item.name)
    setEditQty(item.quantity != null ? formatQty(item.quantity) : '')
    setEditUnit(item.unit ?? '')
  }

  function commitEdit() {
    if (editingIndex === null) return
    const qty = editQty !== '' ? parseFloat(editQty) : null
    setItems((prev) =>
      prev.map((item, i) =>
        i === editingIndex
          ? {
              ...item,
              name: editName.trim() || item.name,
              quantity: qty != null && !isNaN(qty) ? qty : null,
              unit: editUnit.trim() || null,
            }
          : item
      )
    )
    setEditingIndex(null)
  }

  async function handleAddToList() {
    setIsAdding(true)
    const res = await fetch('/api/shopping/items/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    if (res.ok) {
      sessionStorage.removeItem('shopping_preview')
      router.push('/shopping')
    }
    setIsAdding(false)
  }

  if (!loaded) return null

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => router.push('/planner')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft size={16} />
            Planner
          </button>
        </div>
        <p className="text-sm text-gray-500 text-center mt-20">
          Nothing to review.{' '}
          <button
            type="button"
            onClick={() => router.push('/planner')}
            className="underline hover:text-gray-900"
          >
            Go back to the planner
          </button>{' '}
          and generate a list.
        </p>
      </div>
    )
  }

  const grouped = groupItems(items, categories)

  return (
    <div className="max-w-xl mx-auto px-4 py-10 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          type="button"
          onClick={() => router.push('/planner')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={16} />
          Planner
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Review shopping list</h1>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        {items.length} item{items.length !== 1 ? 's' : ''} — remove anything you don&apos;t need, then add to your shopping list.
      </p>

      {/* Grouped items */}
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50 mb-6">
        {grouped.map((group) => (
          <div key={group.category}>
            {(group.category !== 'Other' || grouped.length > 1) && (
              <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                {group.color && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {group.category}
                </span>
              </div>
            )}
            <div className="px-3 pb-1">
              {group.items.map(({ item, index }) => (
                <div key={index} className="flex items-center gap-2 py-2">
                  {editingIndex === index ? (
                    <>
                      <input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIndex(null) }}
                        className="flex-1 min-w-0 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <input
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        placeholder="Qty"
                        type="number"
                        step="any"
                        className="w-14 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <input
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        placeholder="Unit"
                        onKeyDown={(e) => { if (e.key === 'Enter') commitEdit() }}
                        className="w-14 text-sm px-2 py-0.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                      />
                      <button type="button" onClick={commitEdit} className="text-gray-500 hover:text-gray-900">
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={() => setEditingIndex(null)} className="text-gray-400 hover:text-gray-700">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(index)}
                        className="flex-1 min-w-0 text-left text-sm text-gray-900 hover:text-gray-600 transition-colors truncate"
                      >
                        {item.quantity != null && (
                          <span className="text-gray-500 mr-1">
                            {formatQty(item.quantity)}{item.unit ?? ''}
                          </span>
                        )}
                        {item.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(index)}
                        className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                        aria-label="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-xl mx-auto">
          <button
            type="button"
            onClick={handleAddToList}
            disabled={isAdding || items.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            Add {items.length} item{items.length !== 1 ? 's' : ''} to shopping list
          </button>
        </div>
      </div>
    </div>
  )
}
