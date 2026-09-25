'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { locales, LOCALE_LABELS, type Locale } from '@/i18n/config'
import { sendJson } from '../send-json'

export function LanguageStep({ onNext }: { onNext: () => Promise<void> }) {
  const t = useTranslations('auth')
  const router = useRouter()
  const [saving, setSaving] = useState<Locale | null>(null)
  const [failed, setFailed] = useState(false)

  async function choose(locale: Locale) {
    setSaving(locale)
    setFailed(false)
    const ok = await sendJson('PATCH', '/api/profile', { ui_language: locale })
    if (!ok) {
      setSaving(null)
      setFailed(true)
      return
    }
    // Re-renders the server layout so every later step is already in this language.
    router.refresh()
    await onNext()
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5 text-center">
      <div>
        <p className="text-2xl">{t('onboarding.language.greeting')}</p>
        <h2 className="mt-2 font-semibold text-gray-900">{t('onboarding.language.title')}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {locales.map((locale) => (
          <button
            key={locale}
            type="button"
            disabled={saving !== null}
            onClick={() => choose(locale)}
            className="px-4 py-4 border border-gray-300 rounded-xl text-base font-medium text-gray-900 hover:border-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            {LOCALE_LABELS[locale]}
          </button>
        ))}
      </div>
      {failed && <p className="text-sm text-red-600">{t('onboarding.saveError')}</p>}
    </section>
  )
}
