'use client'

import { useState, useEffect } from 'react'
import { usePostHog } from 'posthog-js/react'
import { Copy, Plus, X, Check } from 'lucide-react'
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
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ShoppingItemRow } from './ShoppingItemRow'
import type { ShoppingList, ShoppingItem, ShoppingCategory } from '@/types/database'

interface Props {
  initialList: ShoppingList | null
  initialItems: ShoppingItem[]
  initialCategories: ShoppingCategory[]
  initialRecipeNames: Record<string, string>
}

interface SortableRowProps {
  item: ShoppingItem
  recipeNames: Record<string, string>
  onCheck: (id: string, checked: boolean) => void
  onUpdate: (id: string, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>>) => void
  onDelete: (id: string) => void
}

function SortableRow({ item, ...rowProps }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? 'relative' as const : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <ShoppingItemRow
        item={item}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes as unknown as Record<string, unknown>}
        {...rowProps}
      />
    </div>
  )
}

export function ShoppingClient({ initialList, initialItems, initialCategories, initialRecipeNames }: Props) {
  const [list] = useState<ShoppingList | null>(initialList)
  const [items, setItems] = useState<ShoppingItem[]>(() =>
    [...initialItems].sort((a, b) => a.sort_order - b.sort_order)
  )
  const [categories] = useState<ShoppingCategory[]>(initialCategories)
  const [recipeNames] = useState<Record<string, string>>(initialRecipeNames)
  const [copied, setCopied] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [newItemUnit, setNewItemUnit] = useState('')

  const posthog = usePostHog()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const visibles = items.filter((item) => !item.is_checked)
    const hiddens = items.filter((item) => item.is_checked)
    const oldIndex = visibles.findIndex((item) => item.id === active.id)
    const newIndex = visibles.findIndex((item) => item.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(visibles, oldIndex, newIndex)
    const draggedId = String(active.id)

    // Infer new category: inherit from the item above the drop position,
    // or from the item below if dropped at the very top.
    const itemAbove = newIndex > 0 ? reordered[newIndex - 1] : null
    const newCategory = itemAbove
      ? itemAbove.category
      : (reordered[newIndex + 1]?.category ?? null)
    const categoryChanged = reordered[newIndex].category !== newCategory

    // Optimistic update
    setItems([
      ...reordered.map((item, i) => ({
        ...item,
        sort_order: i,
        ...(item.id === draggedId && categoryChanged ? { category: newCategory } : {}),
      })),
      ...hiddens,
    ])

    // Persist changed positions and/or category
    await Promise.all(
      reordered.flatMap((item, i) => {
        const patches: Record<string, unknown> = {}
        if (item.sort_order !== i) patches.sort_order = i
        if (item.id === draggedId && categoryChanged) patches.category = newCategory
        if (Object.keys(patches).length === 0) return []
        return [fetch(`/api/shopping/items/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patches),
        })]
      })
    )
  }

  const visibleItems = items.filter((item) => !item.is_checked)
  const colorMap = new Map(categories.map((c) => [c.name, c.color]))

  // Show category headers only when there are 2+ distinct effective categories
  const distinctCats = new Set(visibleItems.map((i) => i.category ?? 'Other'))
  const showHeaders = distinctCats.size > 1

  function getListLines() {
    return visibleItems.map((item) => {
      const qty = item.quantity != null ? `${formatQty(item.quantity)}${item.unit ?? ''}` : (item.unit ?? '')
      return qty ? `${qty} ${item.name}` : item.name
    })
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
    <div className="max-w-xl mx-auto px-0 sm:px-6 pt-3 pb-10 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1 px-4 sm:px-0">
        <h1 className="text-xl font-semibold text-gray-900">Shopping List</h1>
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
      <p className="text-xs text-gray-400 mb-4 px-4 sm:px-0">
        {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}
      </p>

      {/* List card — full-width on mobile, rounded on sm+ */}
      <div className="bg-white border-y sm:border border-gray-200 sm:rounded-xl divide-y divide-gray-50">
        {visibleItems.length === 0 && !addingItem ? (
          <p className="text-sm text-gray-400 px-4 py-8 text-center">
            Your shopping list is empty. Add items manually or generate from the planner.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visibleItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="px-3 pb-1">
                {visibleItems.map((item, index) => {
                  const prevItem = index > 0 ? visibleItems[index - 1] : null
                  const currentCat = item.category ?? 'Other'
                  const prevCat = prevItem ? (prevItem.category ?? 'Other') : null
                  const showHeader = showHeaders && currentCat !== prevCat
                  return (
                    <div key={item.id}>
                      {showHeader && (
                        <div className={`${index > 0 ? 'pt-3' : 'pt-3'} pb-1 flex items-center gap-1.5`}>
                          {item.category && colorMap.get(item.category) && (
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: colorMap.get(item.category)! }}
                            />
                          )}
                          <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">
                            {currentCat}
                          </span>
                        </div>
                      )}
                      <SortableRow
                        item={item}
                        recipeNames={recipeNames}
                        onCheck={handleCheck}
                        onUpdate={handleUpdate}
                        onDelete={handleDelete}
                      />
                    </div>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
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
  )
}

function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty)
  return String(parseFloat(qty.toPrecision(3)))
}
