'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'

interface Props {
  initialValue: 'metric' | 'imperial'
  currentPreferredLanguage: string
  recipeIds: string[]
}

export function UnitPreferenceSelector({ initialValue, currentPreferredLanguage, recipeIds }: Props) {
  const [value, setValue] = useState<'metric' | 'imperial'>(initialValue)
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [pendingUnits, setPendingUnits] = useState<'metric' | 'imperial' | null>(null)

  async function handleChange(next: 'metric' | 'imperial') {
    if (next === value) return
    setValue(next)
    setSaving(true)

    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_units: next }),
    })

    setSaving(false)

    if (!res.ok) {
      setValue(value)  // revert on failure
      return
    }

    if (recipeIds.length > 0) {
      const confirmed = confirm(
        `You have ${recipeIds.length} recipe${recipeIds.length === 1 ? '' : 's'}. Convert their units now?`
      )
      if (confirmed) {
        setPendingUnits(next)
        setShowModal(true)
      }
    }
  }

  return (
    <>
      <div className="flex items-center gap-1">
        {(['metric', 'imperial'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => void handleChange(option)}
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

      {showModal && pendingUnits && (
        <BulkTransformModal
          recipeIds={recipeIds}
          targetLanguage={currentPreferredLanguage}
          targetUnits={pendingUnits}
          onClose={() => { setShowModal(false); setPendingUnits(null) }}
        />
      )}
    </>
  )
}
