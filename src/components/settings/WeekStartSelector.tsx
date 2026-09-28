'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { WEEK_START_DAYS, type WeekStartDay } from '@/lib/utils/week'

export function WeekStartSelector({ initialValue }: { initialValue: WeekStartDay }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const [value, setValue] = useState<WeekStartDay>(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: WeekStartDay) {
    if (next === value) return
    const previous = value
    setValue(next)
    setSaving(true)
    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start_day: next }),
    })
    setSaving(false)
    if (!res.ok) return setValue(previous)
    // The week start is read on the server; refresh so the app shell picks it up.
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1">
      {WEEK_START_DAYS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => void handleChange(option)}
          disabled={saving}
          className={`px-3 py-1 text-sm rounded-lg border transition-colors ${
            value === option
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {t(`weekStart.${option}`)}
        </button>
      ))}
    </div>
  )
}
