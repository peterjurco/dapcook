'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'
import { ConfirmTransformModal } from './ConfirmTransformModal'
import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages'

interface Props {
  initialValue: string
  currentPreferredUnits: 'metric' | 'imperial'
  recipeIds: string[]
}

type Phase = 'idle' | 'confirm' | 'bulk'

export function LanguageSelector({ initialValue, currentPreferredUnits, recipeIds }: Props) {
  const [value, setValue] = useState(initialValue)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null)

  async function handleChange(newLang: string) {
    if (newLang === value) return
    setValue(newLang)

    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language: newLang }),
    })

    if (!res.ok) {
      setValue(value)  // revert on failure
      return
    }

    if (recipeIds.length > 0) {
      setPendingLanguage(newLang)
      setPhase('confirm')
    }
  }

  const targetLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === pendingLanguage)?.label ?? pendingLanguage ?? ''

  function handleConfirm() { setPhase('bulk') }
  function handleCancel() { setPhase('idle'); setPendingLanguage(null) }
  function handleBulkClose() { setPhase('idle'); setPendingLanguage(null) }

  return (
    <>
      <select
        value={value}
        onChange={(e) => void handleChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>

      {phase === 'confirm' && pendingLanguage && (
        <ConfirmTransformModal
          recipeCount={recipeIds.length}
          message={`Translate your recipes to ${targetLangLabel}?`}
          confirmLabel="Translate all"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {phase === 'bulk' && pendingLanguage && (
        <BulkTransformModal
          recipeIds={recipeIds}
          targetLanguage={pendingLanguage}
          targetUnits={currentPreferredUnits}
          onClose={handleBulkClose}
        />
      )}
    </>
  )
}
