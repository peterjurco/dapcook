'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

interface StepFrameProps {
  title: string
  help?: string
  children?: ReactNode
  error?: string | null
  onNext: () => Promise<void> | void
  nextLabel?: string
  onSkip?: () => Promise<void> | void
  /** Client-side only: returns to the previous step without saving. */
  onBack?: () => void
  /** Shows "You can change this anytime in Settings." under the buttons. */
  settingsNote?: boolean
}

export function StepFrame({ title, help, children, error, onNext, nextLabel, onSkip, onBack, settingsNote }: StepFrameProps) {
  const t = useTranslations('auth')
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<void> | void) {
    setBusy(true)
    try {
      await action()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {help && <p className="mt-1 text-sm text-gray-500">{help}</p>}
      </div>

      {children}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-end gap-3 pt-1">
        {onBack && <BackButton onClick={onBack} disabled={busy} />}
        {onSkip && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onSkip)}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
          >
            {t('onboarding.skip')}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => run(onNext)}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {nextLabel ?? t('onboarding.next')}
        </button>
      </div>

      {settingsNote && <p className="text-xs text-gray-400 text-right">{t('onboarding.settingsNote')}</p>}
    </section>
  )
}

export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useTranslations('auth')
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mr-auto px-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
    >
      {t('onboarding.back')}
    </button>
  )
}
