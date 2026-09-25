'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { SUPPORTED_LANGUAGES } from '@/lib/constants/languages'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'

export interface TranslationAnswer {
  enabled: boolean
  language: string
}

interface Props {
  /** The last saved answer, shown again when the step is revisited. */
  value: TranslationAnswer
  onSaved: (value: TranslationAnswer) => void
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
}

export function TranslationStep({ value, onSaved, onNext, onSkip }: Props) {
  const t = useTranslations('auth')
  const [enabled, setEnabled] = useState(value.enabled)
  const [language, setLanguage] = useState(value.language)
  const [failed, setFailed] = useState(false)

  async function save() {
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/household', { translation_enabled: enabled, preferred_language: language })
    if (!ok) return setFailed(true)
    onSaved({ enabled, language })
    await onNext()
  }

  return (
    <StepFrame
      title={t('onboarding.translation.title')}
      help={t('onboarding.translation.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      settingsNote
    >
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
        className="flex items-center gap-3 text-sm text-gray-900"
      >
        <span className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${enabled ? 'bg-emerald-600' : 'bg-gray-300'}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </span>
        {t('onboarding.translation.toggle')}
      </button>

      {enabled && (
        <div>
          <p className="text-xs text-gray-500 mb-2">{t('onboarding.translation.languageLabel')}</p>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                aria-pressed={language === lang.code}
                onClick={() => setLanguage(lang.code)}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  language === lang.code
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </StepFrame>
  )
}
