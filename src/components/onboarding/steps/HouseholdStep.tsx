'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createHousehold, joinHousehold } from '@/lib/auth/actions'

interface Props {
  /** Called right before the server action runs — the action redirects, so nothing runs after it. */
  onSubmit: (method: 'create' | 'join') => void
}

export function HouseholdStep({ onSubmit }: Props) {
  const t = useTranslations('auth')
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [name, setName] = useState('')
  const [invite, setInvite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPending(true)
    onSubmit(mode)
    const result = mode === 'create' ? await createHousehold(name) : await joinHousehold(invite)
    setPending(false)
    if (result?.error) setError(result.error)
  }

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400'

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-gray-900">{t('onboarding.household.title')}</h2>
        <p className="mt-1 text-sm text-gray-500">{t('onboarding.household.help')}</p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'create' ? (
          <div>
            <label htmlFor="household-name" className="block text-sm font-medium text-gray-700 mb-1">
              {t('onboarding.household.nameLabel')}
            </label>
            <input
              id="household-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('onboarding.household.namePlaceholder')}
              required
              maxLength={80}
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="invite-link" className="block text-sm font-medium text-gray-700 mb-1">
              {t('onboarding.household.inviteLabel')}
            </label>
            <input
              id="invite-link"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              placeholder={t('onboarding.household.invitePlaceholder')}
              required
              className={inputClass}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {mode === 'create' ? t('onboarding.household.create') : t('onboarding.household.join')}
        </button>
      </form>

      <button
        type="button"
        disabled={pending}
        onClick={() => { setMode(mode === 'create' ? 'join' : 'create'); setError(null) }}
        className="block mx-auto text-sm text-gray-500 underline hover:text-gray-900 disabled:opacity-50"
      >
        {mode === 'create' ? t('onboarding.household.haveInvite') : t('onboarding.household.createInstead')}
      </button>
    </section>
  )
}
