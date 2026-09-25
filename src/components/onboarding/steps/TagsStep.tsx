'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Locale } from '@/i18n/config'
import { TAG_CATALOG, buildTagGroupsPayload } from '@/lib/onboarding/tag-catalog'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'

interface Props {
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  locale: Locale
}

export function TagsStep({ onNext, onSkip, locale }: Props) {
  const t = useTranslations('auth')
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string[]>>({})
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [failed, setFailed] = useState(false)

  function toggle(groupId: string, name: string) {
    setSelected((prev) => {
      const current = prev[groupId] ?? []
      return {
        ...prev,
        [groupId]: current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
      }
    })
  }

  function addCustom(groupId: string) {
    const name = draft.trim()
    setDraft('')
    setAddingTo(null)
    if (!name) return
    setCustom((prev) => ({ ...prev, [groupId]: Array.from(new Set([...(prev[groupId] ?? []), name])) }))
    setSelected((prev) => ({ ...prev, [groupId]: Array.from(new Set([...(prev[groupId] ?? []), name])) }))
  }

  async function save() {
    setFailed(false)
    const groups = buildTagGroupsPayload(selected, locale)
    if (groups.length > 0 && !(await sendJson('POST', '/api/onboarding/tags', { groups }))) {
      return setFailed(true)
    }
    await onNext()
  }

  return (
    <StepFrame
      title={t('onboarding.tags.title')}
      help={t('onboarding.tags.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      settingsNote
    >
      <div className="space-y-5">
        {TAG_CATALOG.map((group) => {
          const names = [...group.tags.map((tag) => tag[locale]), ...(custom[group.id] ?? [])]
          const picked = selected[group.id] ?? []
          return (
            <div key={group.id}>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{group.name[locale]}</p>
              <div className="flex flex-wrap gap-1.5">
                {names.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={picked.includes(name)}
                    onClick={() => toggle(group.id, name)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      picked.includes(name)
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {name}
                  </button>
                ))}
                {addingTo === group.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCustom(group.id)
                      if (e.key === 'Escape') { setAddingTo(null); setDraft('') }
                    }}
                    onBlur={() => addCustom(group.id)}
                    placeholder={t('onboarding.tags.addPlaceholder')}
                    maxLength={50}
                    className="px-2.5 py-1 text-xs rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300 w-28"
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={t('onboarding.tags.addAria', { group: group.name[locale] })}
                    onClick={() => setAddingTo(group.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-dashed border-gray-300 text-gray-500 hover:text-gray-900"
                  >
                    <Plus size={12} />
                    {t('onboarding.tags.add')}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </StepFrame>
  )
}
