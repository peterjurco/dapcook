'use client'

import { useState } from 'react'
import { X, GripVertical } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { PlannerRule } from '@/types/database'
import { RULE_TYPES } from '@/types/planner'

interface PlannerRulesEditorProps {
  initialRules: PlannerRule[]
}

export function PlannerRulesEditor({ initialRules }: PlannerRulesEditorProps) {
  const t = useTranslations('settings')
  const [rules, setRules] = useState<PlannerRule[]>(initialRules)

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
            title={rule.is_active ? t('plannerRules.disableTitle') : t('plannerRules.enableTitle')}
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
              {RULE_TYPES.find((ruleType) => ruleType.value === rule.rule_type)?.label ?? rule.rule_type}
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

      {/* Adding is disabled until AI planning ships — rules have no effect yet. */}
      <p className="text-sm text-gray-400">
        {t('plannerRules.notice')}
      </p>
    </div>
  )
}
