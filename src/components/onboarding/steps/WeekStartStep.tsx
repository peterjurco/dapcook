'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { StepFrame } from '../StepFrame'
import { sendJson } from '../send-json'
import { WEEK_START_DAYS, type WeekStartDay } from '@/lib/utils/week'

interface Props {
  /** The last saved answer, shown again when the step is revisited. */
  value: WeekStartDay
  onSaved: (value: WeekStartDay) => void
  onNext: () => Promise<void>
  onSkip: () => Promise<void>
  onBack: () => void
}

export function WeekStartStep({ value, onSaved, onNext, onSkip, onBack }: Props) {
  const t = useTranslations('auth')
  const [day, setDay] = useState<WeekStartDay>(value)
  const [failed, setFailed] = useState(false)

  async function save() {
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/household', { week_start_day: day })
    if (!ok) return setFailed(true)
    onSaved(day)
    await onNext()
  }

  return (
    <StepFrame
      title={t('onboarding.weekStart.title')}
      help={t('onboarding.weekStart.help')}
      error={failed ? t('onboarding.saveError') : null}
      onNext={save}
      onSkip={onSkip}
      onBack={onBack}
      settingsNote
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {WEEK_START_DAYS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={day === option}
            onClick={() => setDay(option)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              day === option ? 'border-emerald-600 bg-emerald-50' : 'border-gray-300 hover:border-gray-500'
            }`}
          >
            <span className="block text-sm font-semibold text-gray-900">{t(`onboarding.weekStart.${option}`)}</span>
          </button>
        ))}
      </div>
    </StepFrame>
  )
}
