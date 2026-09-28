'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { locales, LOCALE_LABELS, type Locale } from '@/i18n/config'

export function InterfaceLanguageSelector({ initialValue }: { initialValue: Locale }) {
  const t = useTranslations('settings')
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
        setError(t('account.saveError'))
        return
      }
      router.refresh()
    } catch {
      setValue(previous)
      setError(t('account.saveError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="relative inline-block">
        <select
          value={value}
          disabled={saving}
          onChange={(e) => handleChange(e.target.value as Locale)}
          className="text-sm border border-gray-300 rounded-lg pl-3 pr-9 py-2 bg-white appearance-none"
        >
          {locales.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}
