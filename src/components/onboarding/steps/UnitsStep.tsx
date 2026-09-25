'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'

export type Units = 'metric' | 'imperial'

interface Props {
  /** The last saved answer, shown again when the step is revisited. */
  value: Units
  onSaved: (value: Units) => void
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  onBack: () => void
}

export function UnitsStep({ value, onSaved, onNext, onSkip, onBack }: Props) {
  const t = useTranslations('auth')
  const [units, setUnits] = useState<Units>(value)
  const [failed, setFailed] = useState(false)

  async function save() {
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/household', { preferred_units: units })
    if (!ok) return setFailed(true)
    onSaved(units)
    await onNext()
  }

  const options: Array<{ value: Units; label: string; examples: string }> = [
    { value: 'metric', label: t('onboarding.units.metric'), examples: t('onboarding.units.metricExamples') },
    { value: 'imperial', label: t('onboarding.units.imperial'), examples: t('onboarding.units.imperialExamples') },
  ]

  return (
    <StepFrame
      title={t('onboarding.units.title')}
      help={t('onboarding.units.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      onBack={onBack}
      settingsNote
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={units === option.value}
            onClick={() => setUnits(option.value)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              units === option.value ? 'border-emerald-600 bg-emerald-50' : 'border-gray-300 hover:border-gray-500'
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
            <span className="block mt-1 text-sm text-gray-600">{option.examples}</span>
          </button>
        ))}
      </div>
    </StepFrame>
  )
}
