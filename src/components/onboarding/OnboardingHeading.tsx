'use client'

import { useTranslations } from 'next-intl'

export function OnboardingHeading() {
  const t = useTranslations('auth')
  return (
    <h1 className="text-2xl font-semibold text-gray-900 font-fraunces">
      <span className="text-emerald-700">{t('onboarding.headingW')}</span>
      {t('onboarding.headingRest')}
    </h1>
  )
}
