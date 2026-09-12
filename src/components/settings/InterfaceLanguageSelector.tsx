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
  const [error, setError] = useState<string | null>(null)

  async function handleChange(next: Locale) {
    const previous = value
    setError(null)
    setValue(next)
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ui_language: next }),
      })
      if (!res.ok) {
        setValue(previous)
        setError('Could not save. Try again.')
        return
      }
      router.refresh()
    } catch {
      setValue(previous)
      setError('Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
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
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
