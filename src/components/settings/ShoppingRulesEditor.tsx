'use client'

import { useState } from 'react'
import { Plus, X, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ShoppingRule } from '@/types/database'

interface Props {
  initialRules: ShoppingRule[]
}

export function ShoppingRulesEditor({ initialRules }: Props) {
  const t = useTranslations('settings')
  const [rules, setRules] = useState<ShoppingRule[]>(initialRules)
  const [addingRule, setAddingRule] = useState(false)
  const [newRule, setNewRule] = useState('')

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

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
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
              aria-label={t('shoppingRules.removeAria')}
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
            placeholder={t('shoppingRules.placeholder')}
            className="flex-1 text-sm px-2.5 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button type="button" onClick={handleAddRule} className="text-gray-500 hover:text-gray-900">
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => { setAddingRule(false); setNewRule('') }}
            className="text-gray-400 hover:text-gray-700"
          >
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
          {t('shoppingRules.add')}
        </button>
      )}
    </div>
  )
}
