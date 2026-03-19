'use client'

import { useState } from 'react'
import { Plus, X, GripVertical } from 'lucide-react'
import type { PlannerRule } from '@/types/database'
import { RULE_TYPES } from '@/types/planner'

interface PlannerRulesEditorProps {
  initialRules: PlannerRule[]
}

export function PlannerRulesEditor({ initialRules }: PlannerRulesEditorProps) {
  const [rules, setRules] = useState<PlannerRule[]>(initialRules)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [ruleType, setRuleType] = useState('custom')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!label.trim()) return
    setSaving(true)
    const res = await fetch('/api/planner/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rule_type: ruleType, label: label.trim() }),
    })
    if (res.ok) {
      const rule = await res.json() as PlannerRule
      setRules((prev) => [...prev, rule])
      setLabel('')
      setRuleType('custom')
      setAdding(false)
    }
    setSaving(false)
  }

  async function handleToggle(rule: PlannerRule) {
    const res = await fetch(`/api/planner/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    if (res.ok) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/planner/rules/${id}`, { method: 'DELETE' })
    setRules((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-2">
      {rules.length === 0 && !adding && (
        <p className="text-sm text-gray-400">
          No rules yet. Rules will be applied by the AI when generating weekly plans.
        </p>
      )}

      {rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-3 group py-1.5 px-1 rounded-lg hover:bg-gray-50">
          <GripVertical size={14} className="text-gray-300 flex-shrink-0" />

          {/* Active toggle */}
          <button
            type="button"
            onClick={() => handleToggle(rule)}
            className={`w-4 h-4 rounded border flex-shrink-0 transition-colors ${
              rule.is_active ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'
            }`}
            title={rule.is_active ? 'Disable rule' : 'Enable rule'}
          >
            {rule.is_active && (
              <svg viewBox="0 0 16 16" fill="none" className="w-full h-full p-0.5">
                <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>

          <div className="flex-1 min-w-0">
            <p className={`text-sm ${rule.is_active ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
              {rule.label}
            </p>
            <p className="text-xs text-gray-400">
              {RULE_TYPES.find((t) => t.value === rule.rule_type)?.label ?? rule.rule_type}
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleDelete(rule.id)}
            className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="flex flex-col gap-2 pt-1 pb-1">
          <select
            value={ruleType}
            onChange={(e) => setRuleType(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-3 py-2"
          >
            {RULE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. No same recipe within 5 days"
              autoFocus
              className="flex-1 text-sm border border-gray-200 rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-gray-300"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !label.trim()}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50 hover:bg-gray-700 transition-colors"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setLabel('') }}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors mt-1"
        >
          <Plus size={14} />
          Add rule
        </button>
      )}
    </div>
  )
}
