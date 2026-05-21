'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'
import { ConfirmTransformModal } from './ConfirmTransformModal'

interface Props {
  initialValue: 'metric' | 'imperial'
  currentPreferredLanguage: string
  translationEnabled: boolean
  recipeIds: string[]
}

type Phase = 'idle' | 'confirm' | 'bulk'

export function UnitPreferenceSelector({ initialValue, currentPreferredLanguage, translationEnabled, recipeIds }: Props) {
  const [value, setValue] = useState<'metric' | 'imperial'>(initialValue)
  const [saving, setSaving] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
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
      setPendingUnits(next)
      setPhase('confirm')
    }
  }

  function handleConfirm() { setPhase('bulk') }
  function handleCancel() { setPhase('idle'); setPendingUnits(null) }
  function handleBulkClose() { setPhase('idle'); setPendingUnits(null) }

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

      {phase === 'confirm' && pendingUnits && (
        <ConfirmTransformModal
          recipeCount={recipeIds.length}
          message={`Convert your recipes to ${pendingUnits} units?`}
          confirmLabel="Convert all"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {phase === 'bulk' && pendingUnits && (
        <BulkTransformModal
          recipeIds={recipeIds}
          targetLanguage={translationEnabled ? currentPreferredLanguage : 'en'}
          targetUnits={pendingUnits}
          onClose={handleBulkClose}
        />
      )}
    </>
  )
}
