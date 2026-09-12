'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { WeekPlanRule } from '@/types/database'
import { RULE_TYPES } from '@/types/planner'

interface WeekRulesPanelProps {
  weekPlanId: string
  rules: WeekPlanRule[]
  onAdd: (rule: WeekPlanRule) => void
  onDelete: (id: string) => void
  onToggle: (id: string, isActive: boolean) => void
}

export function WeekRulesPanel({ weekPlanId, rules, onAdd, onDelete, onToggle }: WeekRulesPanelProps) {
  const t = useTranslations('planner')
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [ruleType, setRuleType] = useState('custom')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    if (!label.trim()) return
    setSaving(true)
    const res = await fetch('/api/planner/week-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_plan_id: weekPlanId, rule_type: ruleType, label: label.trim() }),
    })
    if (res.ok) {
      const rule = await res.json() as WeekPlanRule
      onAdd(rule)
      setLabel('')
      setAdding(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await fetch(`/api/planner/week-rules/${id}`, { method: 'DELETE' })
    onDelete(id)
  }

  async function handleToggle(rule: WeekPlanRule) {
    const res = await fetch(`/api/planner/week-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    if (res.ok) onToggle(rule.id, !rule.is_active)
  }

  const activeCount = rules.filter((r) => r.is_active).length

  return (
    <div className="mt-6 border border-gray-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-sm"
      >
        <span className="font-medium text-gray-700">
          {t('rules.heading')}
          {rules.length > 0 && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              {t('rules.activeCount', { count: activeCount })}
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
            {t('rules.notEnforcedWarning')}
          </p>

          {rules.length === 0 && !adding && (
            <p className="text-sm text-gray-400">{t('rules.noneYet')}</p>
          )}

          {/* Rule list */}
          {rules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 group">
              <button
                type="button"
                onClick={() => handleToggle(rule)}
                className={`w-4 h-4 rounded border flex-shrink-0 transition-colors ${
                  rule.is_active
                    ? 'bg-gray-900 border-gray-900'
                    : 'bg-white border-gray-300'
                }`}
                title={rule.is_active ? t('rules.disableTitle') : t('rules.enableTitle')}
              >
                {rule.is_active && (
                  <svg viewBox="0 0 16 16" fill="none" className="w-full h-full p-0.5">
                    <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span className={`flex-1 text-sm ${rule.is_active ? 'text-gray-800' : 'text-gray-400 line-through'}`}>
                {rule.label}
              </span>
              <span className="text-xs text-gray-400 hidden group-hover:inline">
                {RULE_TYPES.find((t) => t.value === rule.rule_type)?.label ?? rule.rule_type}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(rule.id)}
                className="text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <X size={14} />
              </button>
            </div>
          ))}

          {/* Add form */}
          {adding ? (
            <div className="flex flex-col gap-2 pt-1">
              <select
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="text-sm border border-gray-200 rounded-md px-2 py-1.5"
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
                  placeholder={t('rules.placeholder')}
                  autoFocus
                  className="flex-1 text-sm border border-gray-200 rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-gray-300"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={saving || !label.trim()}
                  className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md disabled:opacity-50"
                >
                  {t('rules.add')}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setLabel('') }}
                  className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  {t('rules.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Plus size={14} />
              {t('rules.addRuleFor')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
