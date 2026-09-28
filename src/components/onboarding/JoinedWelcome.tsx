'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePostHog } from 'posthog-js/react'
import { OnboardingHeading } from './OnboardingHeading'
import { StepFrame } from './StepFrame'
import { LanguageStep } from './steps/LanguageStep'

/**
 * Onboarding for someone who joined an existing household: the household is
 * already set up, so the only personal choice left is the interface language.
 */
export function JoinedWelcome({ householdName }: { householdName: string }) {
  const t = useTranslations('auth')
  const router = useRouter()
  const posthog = usePostHog()
  const [step, setStep] = useState<'language' | 'done'>('language')

  async function languageChosen() {
    posthog?.capture('onboarding_step_completed', { step: 'language', skipped: false })
    setStep('done')
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <OnboardingHeading />
        </div>

        {step === 'language' && <LanguageStep onNext={languageChosen} />}

        {step === 'done' && (
          <StepFrame
            title={t('onboarding.joined.title', { household: householdName })}
            onNext={() => router.push('/recipes?ob=1&obm=join')}
            nextLabel={t('onboarding.joined.cta')}
          >
            <p className="text-sm text-gray-600">{t('onboarding.joined.body')}</p>
          </StepFrame>
        )}
      </div>
    </div>
  )
}
