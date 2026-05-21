'use client'

import { useState } from 'react'
import { BulkTransformModal } from './BulkTransformModal'
import { ConfirmTransformModal } from './ConfirmTransformModal'
import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages'

interface Props {
  initialEnabled: boolean
  initialLanguage: string
  currentPreferredUnits: 'metric' | 'imperial'
  recipeIds: string[]
}

type Phase = 'idle' | 'confirm' | 'bulk'

export function TranslationSettings({ initialEnabled, initialLanguage, currentPreferredUnits, recipeIds }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [language, setLanguage] = useState(initialLanguage)
  const [phase, setPhase] = useState<Phase>('idle')
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null)

  async function handleToggle(next: boolean) {
    setEnabled(next)

    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translation_enabled: next }),
    })

    if (!res.ok) {
      setEnabled(!next)  // revert on failure
      return
    }

    // When enabling translation with existing recipes, offer to bulk translate
    if (next && recipeIds.length > 0) {
      setPendingLanguage(language)
      setPhase('confirm')
    }
  }

  async function handleLanguageChange(newLang: string) {
    if (newLang === language) return
    setLanguage(newLang)

    const res = await fetch('/api/household', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_language: newLang }),
    })

    if (!res.ok) {
      setLanguage(language)  // revert on failure
      return
    }

    if (recipeIds.length > 0) {
      setPendingLanguage(newLang)
      setPhase('confirm')
    }
  }

  const targetLangLabel = SUPPORTED_LANGUAGES.find((l) => l.code === (pendingLanguage ?? language))?.label ?? pendingLanguage ?? ''

  function handleConfirm() { setPhase('bulk') }
  function handleCancel() { setPhase('idle'); setPendingLanguage(null) }
  function handleBulkClose() { setPhase('idle'); setPendingLanguage(null) }

  return (
    <>
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => void handleToggle(!enabled)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 ${
              enabled ? 'bg-gray-900' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-gray-700">Translate imported recipes</span>
        </label>

        {enabled && (
          <select
            value={language}
            onChange={(e) => void handleLanguageChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        )}
      </div>

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
