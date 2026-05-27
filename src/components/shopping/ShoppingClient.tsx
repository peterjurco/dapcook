'use client'

import { useState, useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import { Copy, Plus, X, Check } from 'lucide-react'
import { ShoppingItemRow } from './ShoppingItemRow'
import type { ShoppingList, ShoppingItem, ShoppingCategory } from '@/types/database'

interface Props {
  initialList: ShoppingList | null
  initialItems: ShoppingItem[]
  initialCategories: ShoppingCategory[]
  initialRecipeNames: Record<string, string>
}

interface GroupedItems {
  category: string
  color: string | null
  items: ShoppingItem[]
}

export function ShoppingClient({ initialList, initialItems, initialCategories, initialRecipeNames }: Props) {
  const [list] = useState<ShoppingList | null>(initialList)
  const [items, setItems] = useState<ShoppingItem[]>(initialItems)
  const [categories] = useState<ShoppingCategory[]>(initialCategories)
  const [recipeNames] = useState<Record<string, string>>(initialRecipeNames)
  const [copied, setCopied] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [newItemUnit, setNewItemUnit] = useState('')

  const posthog = usePostHog()

  useEffect(() => {
    posthog.capture('shopping_list_viewed')
  }, [posthog])

  async function handleCheck(id: string, checked: boolean) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, is_checked: checked } : item))
    await fetch(`/api/shopping/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_checked: checked }),
    })
  }

  async function handleUpdate(id: string, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>>) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...changes } : item))
    await fetch(`/api/shopping/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    await fetch(`/api/shopping/items/${id}`, { method: 'DELETE' })
  }

  async function handleAddItem() {
    if (!list || !newItemName.trim()) return
    const qty = newItemQty !== '' ? parseFloat(newItemQty) : null
    const res = await fetch('/api/shopping/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        list_id: list.id,
        name: newItemName.trim(),
        quantity: isNaN(qty as number) ? null : qty,
        unit: newItemUnit.trim() || null,
      }),
    })
    if (res.ok) {
      const created = await res.json() as ShoppingItem
      setItems((prev) => [...prev, created])
    }
    setNewItemName('')
    setNewItemQty('')
    setNewItemUnit('')
    setAddingItem(false)
  }

  const visibleItems = items.filter((item) => !item.is_checked)
  const grouped = groupItems(visibleItems, categories)

  function getListLines() {
    return grouped.flatMap((group) =>
      group.items.map((item) => {
        const qty = item.quantity != null ? `${formatQty(item.quantity)}${item.unit ?? ''}` : (item.unit ?? '')
        return qty ? `${qty} ${item.name}` : item.name
      })
    )
  }

  async function copyToClipboard() {
    const lines = getListLines()
    const text = lines.join('\n')
    const html = `<ul>${lines.map((l) => `<li>${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}</ul>`
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ])
    } catch {
      await navigator.clipboard.writeText(text)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-10 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Shopping List</h1>
      </div>

      {/* List */}
      <div className="space-y-4">
        {/* List header */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-400">{visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}</p>
          {visibleItems.length > 0 && (
            <button
              type="button"
              onClick={copyToClipboard}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
              {copied ? 'Copied!' : 'Copy list'}
            </button>
          )}
        </div>

        {/* Items grouped by category */}
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
          {visibleItems.length === 0 && !addingItem ? (
            <p className="text-sm text-gray-400 px-4 py-8 text-center">
              Your shopping list is empty. Add items manually or generate from the planner.
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.category}>
                {group.category !== 'Other' || grouped.length > 1 ? (
                  <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                    {group.color && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color }}
                      />
                    )}
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{group.category}</span>
                  </div>
                ) : null}
                <div className="px-3 pb-1">
                  {group.items.map((item) => (
                    <ShoppingItemRow
                      key={item.id}
                      item={item}
                      categories={categories}
                      recipeNames={recipeNames}
                      onCheck={handleCheck}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Add item row */}
          <div className="px-4 py-2">
            {addingItem ? (
              <div className="flex items-center gap-2 py-1">
                <input
                  autoFocus
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); if (e.key === 'Escape') { setAddingItem(false) } }}
                  placeholder="Item name"
                  className="flex-1 min-w-0 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <input
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  placeholder="Qty"
                  type="number"
                  step="any"
                  className="w-16 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <input
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="Unit"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem() }}
                  className="w-16 text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button type="button" onClick={handleAddItem} className="text-gray-500 hover:text-gray-900 flex-shrink-0">
                  <Check size={14} />
                </button>
                <button type="button" onClick={() => setAddingItem(false)} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingItem(true)}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors py-1"
              >
                <Plus size={14} />
                Add item
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function groupItems(items: ShoppingItem[], categories: ShoppingCategory[]): GroupedItems[] {
  const categoryOrder = new Map(categories.map((c, i) => [c.name, i]))
  const colorMap = new Map(categories.map((c) => [c.name, c.color]))

  // Sort items by category order, then alphabetically within
  const sorted = [...items].sort((a, b) => {
    const ai = a.category ? (categoryOrder.get(a.category) ?? 999) : 999
    const bi = b.category ? (categoryOrder.get(b.category) ?? 999) : 999
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })

  const groups = new Map<string, ShoppingItem[]>()
  for (const item of sorted) {
    const cat = item.category && categoryOrder.has(item.category) ? item.category : 'Other'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(item)
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
