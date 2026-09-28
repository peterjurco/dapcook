'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Pencil } from 'lucide-react'

export function HouseholdNameEditor({ initialName }: { initialName: string }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [draft, setDraft] = useState(initialName)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  function startEditing() {
    setDraft(name)
    setFailed(false)
    setEditing(true)
  }

  async function save() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditing(false)
      return
    }
    setSaving(true)
    setFailed(false)
    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) {
      setFailed(true)
      return
    }
    setName(trimmed)
    setEditing(false)
    router.refresh()
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-900">{name}</p>
        <button
          type="button"
          onClick={startEditing}
          aria-label={t('page.rename')}
          className="text-gray-400 hover:text-gray-700"
        >
          <Pencil size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          maxLength={80}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="flex-1 text-sm px-2.5 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
        />
        <button type="button" onClick={save} disabled={saving} className="text-xs font-medium text-gray-900 hover:text-gray-600">
          {t('page.save')}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs text-gray-500 hover:text-gray-900">
          {t('page.cancel')}
        </button>
      </div>
      {failed && <p className="text-xs text-red-600">{t('page.nameSaveError')}</p>}
    </div>
  )
}
