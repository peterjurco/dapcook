'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { locales, type Locale } from '@/i18n/config'

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  sk: 'Slovenčina',
}

export function InterfaceLanguageSelector({ initialValue }: { initialValue: Locale }) {
  const router = useRouter()
  const [value, setValue] = useState<Locale>(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: Locale) {
    setValue(next)
    setSaving(true)
    try {
      await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_language: next }),
      })
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as Locale)}
      className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white"
    >
      {locales.map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </select>
  )
}
