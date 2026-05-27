'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { ShoppingItemRow } from './ShoppingItemRow'
import type { ShoppingItem, ShoppingCategory } from '@/types/database'

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
  items: ShoppingItem[]
}

function groupItems(items: ShoppingItem[], categories: ShoppingCategory[]): GroupedItems[] {
  const categoryOrder = new Map(categories.map((c, i) => [c.name, i]))
  const colorMap = new Map(categories.map((c) => [c.name, c.color]))

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

  return Array.from(groups.entries()).map(([category, groupedItems]) => ({
    category,
    color: colorMap.get(category) ?? null,
    items: groupedItems,
  }))
}

export function ShoppingReviewClient() {
  const router = useRouter()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [categories, setCategories] = useState<ShoppingCategory[]>([])
  const [loaded, setLoaded] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('shopping_preview')
    if (raw) {
      try {
        const data = JSON.parse(raw) as PreviewData
        const fakeItems: ShoppingItem[] = data.items.map((item, i) => ({
          id: `preview-${i}`,
          shopping_list_id: 'preview',
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          is_checked: false,
          sort_order: i,
          source_recipe_ids: [],
        }))
        const fakeCategories: ShoppingCategory[] = data.categories.map((c, i) => ({
          id: `preview-cat-${i}`,
          household_id: 'preview',
          name: c.name,
          color: c.color,
          sort_order: i,
          created_at: new Date().toISOString(),
        }))
        setItems(fakeItems)
        setCategories(fakeCategories)
      } catch {
        // malformed — treat as empty
      }
    }
    setLoaded(true)
  }, [])

  function handleCheck(id: string, checked: boolean) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, is_checked: checked } : item))
  }

  function handleUpdate(id: string, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>>) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...changes } : item))
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  async function handleAddToList() {
    const toAdd = items.filter((item) => !item.is_checked)
    if (toAdd.length === 0) return
    setIsAdding(true)
    const res = await fetch('/api/shopping/items/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: toAdd.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
        })),
      }),
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
          <button type="button" onClick={() => router.push('/planner')} className="underline hover:text-gray-900">
            Go back to the planner
          </button>{' '}
          and generate a list.
        </p>
      </div>
    )
  }

  const uncheckedItems = items.filter((item) => !item.is_checked)
  const grouped = groupItems(items, categories)

  return (
    <div className="max-w-xl mx-auto px-4 py-10 pb-28">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
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

      <p className="text-sm text-gray-500 mb-4">
        Edit or cross off items, then add to your list.
      </p>

      <p className="text-xs text-gray-400 mb-4">
        {uncheckedItems.length} item{uncheckedItems.length !== 1 ? 's' : ''}
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
              {group.items.map((item) => (
                <ShoppingItemRow
                  key={item.id}
                  item={item}
                  categories={categories}
                  recipeNames={{}}
                  onCheck={handleCheck}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
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
            disabled={isAdding || uncheckedItems.length === 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isAdding ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : null}
            Add {uncheckedItems.length} item{uncheckedItems.length !== 1 ? 's' : ''} to shopping list
          </button>
        </div>
      </div>
    </div>
  )
}
