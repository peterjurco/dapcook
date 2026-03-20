'use client'

import { useState } from 'react'

interface Props {
  initialValue: 'metric' | 'imperial'
}

export function UnitPreferenceSelector({ initialValue }: Props) {
  const [value, setValue] = useState<'metric' | 'imperial'>(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: 'metric' | 'imperial') {
    if (next === value) return
    setValue(next)
    setSaving(true)
    await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_units: next }),
    })
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-1">
      {(['metric', 'imperial'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => handleChange(option)}
          disabled={saving}
          className={`px-3 py-1 text-sm rounded-lg border transition-colors capitalize ${
            value === option
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}
