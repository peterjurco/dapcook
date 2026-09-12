'use client'

import { useState } from 'react'
import { createHousehold, joinHousehold } from '@/lib/auth/actions'
import { useTranslations } from 'next-intl'

export default function OnboardingPage() {
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  const t = useTranslations('auth')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const result = await createHousehold(householdName)
    if (result?.error) setCreateError(result.error)
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const result = await joinHousehold(inviteCode)
    if (result?.error) setJoinError(result.error)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{t('onboarding.heading')}</h1>
          <p className="mt-1 text-gray-500">{t('onboarding.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Create household */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-1">{t('onboarding.createHeading')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('onboarding.createHelp')}</p>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label htmlFor="household-name" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('onboarding.householdNameLabel')}
                </label>
                <input
                  id="household-name"
                  type="text"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder={t('onboarding.householdNamePlaceholder')}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
              <button
                type="submit"
                className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                {t('onboarding.createButton')}
              </button>
            </form>
          </div>

          {/* Join household */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-1">{t('onboarding.joinHeading')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('onboarding.joinHelp')}</p>
            <form onSubmit={handleJoin} className="space-y-3">
              <div>
                <label htmlFor="invite-code" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('onboarding.inviteCodeLabel')}
                </label>
                <input
                  id="invite-code"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder={t('onboarding.inviteCodePlaceholder')}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              {joinError && <p className="text-sm text-red-600">{joinError}</p>}
              <button
                type="submit"
                className="w-full px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
              >
                {t('onboarding.joinButton')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
