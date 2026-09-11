'use client'

import { useState, useEffect } from 'react'
import { formatQtyUnit } from '@/lib/shopping/format-quantity'
import { usePostHog } from 'posthog-js/react'
import { Copy, Check, Trash2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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
  isNewItem?: boolean
  onCreateBelow?: (id: string) => void
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
  const [items, setItems] = useState<ShoppingItem[]>(() => {
    const catOrder = new Map(initialCategories.map((c, i) => [c.name, i]))
    return [...initialItems].sort((a, b) => {
      const ai = a.category ? (catOrder.get(a.category) ?? 999) : 999
      const bi = b.category ? (catOrder.get(b.category) ?? 999) : 999
      if (ai !== bi) return ai - bi
      return a.sort_order - b.sort_order
    })
  })
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(() => new Set())
  const [categories] = useState<ShoppingCategory[]>(initialCategories)
  const [recipeNames] = useState<Record<string, string>>(initialRecipeNames)
  const [copied, setCopied] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const posthog = usePostHog()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  useEffect(() => {
    posthog.capture('shopping_list_viewed')
  }, [posthog])

  useEffect(() => {
    if (!list) return
    const supabase = createClient()
    const channel = supabase
      .channel(`shopping-${list.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shopping_items', filter: `shopping_list_id=eq.${list.id}` },
        (payload) => {
          const updated = payload.new as ShoppingItem
          setItems((prev) => prev.map((item) => item.id === updated.id ? updated : item))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_items', filter: `shopping_list_id=eq.${list.id}` },
        (payload) => {
          const newItem = payload.new as ShoppingItem
          setItems((prev) => {
            if (prev.some((item) => item.id === newItem.id)) return prev
            const catOrder = new Map(categories.map((c, i) => [c.name, i]))
            return [...prev, newItem].sort((a, b) => {
              const ai = a.category ? (catOrder.get(a.category) ?? 999) : 999
              const bi = b.category ? (catOrder.get(b.category) ?? 999) : 999
              if (ai !== bi) return ai - bi
              return a.sort_order - b.sort_order
            })
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_items' },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id
          setItems((prev) => prev.filter((item) => item.id !== deletedId))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [list])

  async function handleCheck(id: string, checked: boolean) {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, is_checked: checked } : item))
    await fetch(`/api/shopping/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_checked: checked }),
    })
  }

  async function handleUpdate(id: string, changes: Partial<Pick<ShoppingItem, 'name' | 'quantity' | 'unit' | 'category'>>) {
    if (pendingItemIds.has(id)) {
      // Pending item: POST to create for real, then PATCH sort_order to keep position
      if (!changes.name?.trim()) {
        setItems((prev) => prev.filter((item) => item.id !== id))
        return
      }
      const pendingItem = items.find((i) => i.id === id)
      if (!list || !pendingItem) return
      const res = await fetch('/api/shopping/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          list_id: list.id,
          name: changes.name.trim(),
          category: pendingItem.category,
          quantity: null,
          unit: null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save item')
      const created = await res.json() as ShoppingItem
      const targetOrder = pendingItem.sort_order
      await fetch(`/api/shopping/items/${created.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: targetOrder }),
      })
      setItems((prev) => prev.map((item) =>
        item.id === id ? { ...created, sort_order: targetOrder } : item
      ))
      setPendingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, ...changes } : item))
    await fetch(`/api/shopping/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
    const wasPending = pendingItemIds.has(id)
    if (wasPending) {
      setPendingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } else {
      await fetch(`/api/shopping/items/${id}`, { method: 'DELETE' })
    }
  }

  function handleCreateBelow(afterId: string) {
    const afterItem = items.find((i) => i.id === afterId)
    if (!afterItem) return
    const pendingItem: ShoppingItem = {
      id: crypto.randomUUID(),
      shopping_list_id: list?.id ?? '',
      name: '',
      quantity: null,
      unit: null,
      category: afterItem.category,
      is_checked: false,
      sort_order: afterItem.sort_order + 0.5,
      source_recipe_ids: [],
    }
    setPendingItemIds((prev) => new Set(prev).add(pendingItem.id))
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === afterId)
      if (idx === -1) return [...prev, pendingItem]
      const next = [...prev]
      next.splice(idx + 1, 0, pendingItem)
      return next
    })
  }

  function handleCreateFirst() {
    const pendingItem: ShoppingItem = {
      id: crypto.randomUUID(),
      shopping_list_id: list?.id ?? '',
      name: '',
      quantity: null,
      unit: null,
      category: null,
      is_checked: false,
      sort_order: 0,
      source_recipe_ids: [],
    }
    setPendingItemIds((prev) => new Set(prev).add(pendingItem.id))
    setItems([pendingItem])
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

    // Persist changed positions and/or category (skip unsaved pending items)
    await Promise.all(
      reordered.flatMap((item, i) => {
        if (pendingItemIds.has(item.id)) return []
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

  const distinctCats = new Set(visibleItems.map((i) => i.category ?? 'Other'))
  const showHeaders = distinctCats.size >= 1

  function getListLines() {
    return visibleItems.map((item) => {
      const qty = item.quantity != null ? formatQtyUnit(item.quantity, item.unit ?? '') : (item.unit ?? '')
      return qty ? `${qty} ${item.name}` : item.name
    })
  }

  async function handleClearList() {
    setShowClearConfirm(false)
    const snapshot = items
    setItems([])
    const res = await fetch(`/api/shopping/list/${list!.id}/items`, { method: 'DELETE' })
    if (!res.ok) {
      setItems(snapshot)
    }
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
    <div className="max-w-xl mx-auto px-0 sm:px-6 pt-6 pb-10 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-1 px-4 sm:px-0">
        <h1 className="text-xl font-semibold text-gray-900 font-fraunces">
          <span className="text-emerald-700">S</span>hopping List
        </h1>
        {visibleItems.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyToClipboard}
              aria-label={copied ? 'Copied!' : 'Copy list'}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
            >
              {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
              {copied ? 'Copied!' : <>Copy<span className="hidden sm:inline"> list</span></>}
            </button>
            {list && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                aria-label="Clear list"
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors"
              >
                <Trash2 size={15} />
                Clear<span className="hidden sm:inline"> list</span>
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-4 px-4 sm:px-0">
        {visibleItems.length} item{visibleItems.length !== 1 ? 's' : ''}
      </p>

      {/* List card — full-width on mobile, rounded on sm+ */}
      <div className="sm:bg-white sm:border sm:border-gray-200 sm:rounded-xl divide-y divide-gray-50">
        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <p className="text-sm text-gray-400">
              Your shopping list is empty. Add items manually or generate from the planner.
            </p>
            <button
              type="button"
              onClick={handleCreateFirst}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Plus size={15} />
              Add item
            </button>
          </div>
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
                        isNewItem={pendingItemIds.has(item.id)}
                        onCreateBelow={handleCreateBelow}
                      />
                    </div>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {showClearConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="bg-white rounded-xl p-6 shadow-xl max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-gray-900 font-medium mb-5">Remove all items from the list?</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearList}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
