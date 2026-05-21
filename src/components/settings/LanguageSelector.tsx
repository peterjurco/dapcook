'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'ru', label: 'Russian' },
  { code: 'cs', label: 'Czech' },
  { code: 'sk', label: 'Slovak' },
] as const

interface Props {
  initialValue: string
  currentPreferredUnits: 'metric' | 'imperial'
  recipeIds: string[]
}

export function LanguageSelector({ initialValue, currentPreferredUnits, recipeIds }: Props) {
  const [value, setValue] = useState(initialValue)
  const [showModal, setShowModal] = useState(false)
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null)

  async function handleChange(newLang: string) {
    if (newLang === value) return
    setValue(newLang)

    await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language: newLang }),
    })

    if (recipeIds.length > 0) {
      const confirmed = confirm(
        `You have ${recipeIds.length} recipe${recipeIds.length === 1 ? '' : 's'}. Translate them now?`
      )
      if (confirmed) {
        setPendingLanguage(newLang)
        setShowModal(true)
      }
    }
  }

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

      {showModal && pendingLanguage && (
        <BulkTransformModal
          recipeIds={recipeIds}
          targetLanguage={pendingLanguage}
          targetUnits={currentPreferredUnits}
          onClose={() => { setShowModal(false); setPendingLanguage(null) }}
        />
      )}
    </>
  )
}
