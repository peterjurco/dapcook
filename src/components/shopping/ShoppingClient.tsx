'use client'

import { useState } from 'react'
import { ShoppingCart, Sparkles, Copy, Plus, X, Check } from 'lucide-react'
import { ShoppingItemRow } from './ShoppingItemRow'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import type { ShoppingList, ShoppingItem, ShoppingCategory, ShoppingRule } from '@/types/database'

interface Props {
  initialList: ShoppingList | null
  initialItems: ShoppingItem[]
  initialCategories: ShoppingCategory[]
  initialRecipeNames: Record<string, string>
  initialRules: ShoppingRule[]
  defaultDateFrom: string
  defaultDateTo: string
}

interface GroupedItems {
  category: string
  color: string | null
  items: ShoppingItem[]
}

export function ShoppingClient({ initialList, initialItems, initialCategories, initialRecipeNames, initialRules, defaultDateFrom, defaultDateTo }: Props) {
  const [list, setList] = useState<ShoppingList | null>(initialList)
  const [items, setItems] = useState<ShoppingItem[]>(initialItems)
  const [categories, setCategories] = useState<ShoppingCategory[]>(initialCategories)
  const [recipeNames, setRecipeNames] = useState<Record<string, string>>(initialRecipeNames)
  const [rules, setRules] = useState<ShoppingRule[]>(initialRules)
  const [dateFrom, setDateFrom] = useState(defaultDateFrom)
  const [dateTo, setDateTo] = useState(defaultDateTo)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isMakingSmarter, setIsMakingSmarter] = useState(false)
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
  const [copied, setCopied] = useState(false)
  const [addingItem, setAddingItem] = useState(false)
  const [newItemName, setNewItemName] = useState('')
  const [newItemQty, setNewItemQty] = useState('')
  const [newItemUnit, setNewItemUnit] = useState('')
  const [newRule, setNewRule] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  async function generateList(confirmOverwrite = false) {
    setIsGenerating(true)
    const res = await fetch('/api/shopping/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: dateFrom, date_to: dateTo, confirm_overwrite: confirmOverwrite }),
    })

    if (res.status === 409) {
      setIsGenerating(false)
      setShowOverwriteConfirm(true)
      return
    }

    if (res.ok) {
      const data = await res.json() as { list: ShoppingList; items: ShoppingItem[] }
      setList(data.list)
      setItems(data.items)
      // Fetch recipe names for the new items
      const listRes = await fetch('/api/shopping/list')
      if (listRes.ok) {
        const listData = await listRes.json() as { recipeNames: Record<string, string> }
        setRecipeNames(listData.recipeNames)
      }
    }
    setIsGenerating(false)
    setShowOverwriteConfirm(false)
  }

  async function makeSmarter() {
    if (!list) return
    setIsMakingSmarter(true)
    const res = await fetch('/api/shopping/make-smarter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list_id: list.id }),
    })
    if (res.ok) {
      const data = await res.json() as { items: ShoppingItem[]; categories: ShoppingCategory[] }
      setItems(data.items)
      setCategories(data.categories)
    }
    setIsMakingSmarter(false)
  }

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

  async function handleAddRule() {
    if (!newRule.trim()) return
    const res = await fetch('/api/shopping/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule: newRule.trim() }),
    })
    if (res.ok) {
      const created = await res.json() as ShoppingRule
      setRules((prev) => [...prev, created])
    }
    setNewRule('')
    setAddingRule(false)
  }

  async function handleDeleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id))
    await fetch(`/api/shopping/rules/${id}`, { method: 'DELETE' })
  }

  function copyToClipboard() {
    const lines = items.map((item) => {
      const qty = item.quantity != null ? `${formatQty(item.quantity)}${item.unit ?? ''}` : (item.unit ?? '')
      return qty ? `${qty} ${item.name}` : item.name
    })
    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const grouped = groupItems(items, categories)

  return (
    <div className="max-w-xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-xl font-semibold text-gray-900">Shopping List</h1>
        {list && items.length > 0 && (
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy list'}
          </button>
        )}
      </div>

      {/* Generate controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom}
              className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div className="pt-5">
            <button
              type="button"
              onClick={() => generateList()}
              disabled={isGenerating || !dateFrom || !dateTo}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ShoppingCart size={14} />
              )}
              Generate
            </button>
          </div>
        </div>

        {/* AI rules */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <Sparkles size={12} className="text-yellow-400" />
              Rules for AI
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {rules.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
              >
                {r.rule}
                <button
                  type="button"
                  onClick={() => handleDeleteRule(r.id)}
                  className="text-gray-400 hover:text-gray-700 transition-colors ml-0.5"
                  aria-label="Remove rule"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          {addingRule ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddRule()
                  if (e.key === 'Escape') { setAddingRule(false); setNewRule('') }
                }}
                placeholder="e.g. Do not include water"
                className="flex-1 text-sm px-2.5 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
              <button type="button" onClick={handleAddRule} className="text-gray-500 hover:text-gray-900">
                <Check size={14} />
              </button>
              <button type="button" onClick={() => { setAddingRule(false); setNewRule('') }} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingRule(true)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Plus size={12} />
              Add rule
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {list && (
        <div className="space-y-4">
          {/* List header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{list.name}</p>
              <p className="text-xs text-gray-400">{items.length} item{items.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              type="button"
              onClick={makeSmarter}
              disabled={isMakingSmarter || items.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isMakingSmarter ? (
                <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Sparkles size={14} className="text-yellow-400" />
              )}
              Make smarter
            </button>
          </div>

          {/* Items grouped by category */}
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-50">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 px-4 py-6 text-center">No items. Add some manually or generate from a plan.</p>
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
      )}

      {showOverwriteConfirm && (
        <ConfirmModal
          message="You already have a shopping list. Generating a new one will replace it. Continue?"
          confirmLabel="Replace"
          onConfirm={() => generateList(true)}
          onCancel={() => setShowOverwriteConfirm(false)}
        />
      )}
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
