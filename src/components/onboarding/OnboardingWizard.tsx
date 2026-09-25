'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { usePostHog } from 'posthog-js/react'
import type { Locale } from '@/i18n/config'
import type { ShoppingCategory, ShoppingRule } from '@/types/database'
import {
  isPersistedStep,
  nextStep,
  persistedStepAfter,
  stepNumber,
  TOTAL_STEPS,
  type OnboardingStep,
} from '@/lib/onboarding/steps'
import { SHOPPING_RULE_EXAMPLES } from '@/lib/onboarding/defaults'
import { ShoppingCategoriesEditor } from '@/components/settings/ShoppingCategoriesEditor'
import { ShoppingRulesEditor } from '@/components/settings/ShoppingRulesEditor'
import { StepFrame } from './StepFrame'
import { sendJson } from './send-json'
import { LanguageStep } from './steps/LanguageStep'
import { HouseholdStep } from './steps/HouseholdStep'
import { TranslationStep } from './steps/TranslationStep'
import { UnitsStep } from './steps/UnitsStep'
import { TagsStep } from './steps/TagsStep'

export interface OnboardingHousehold {
  translationEnabled: boolean
  preferredLanguage: string
  preferredUnits: 'metric' | 'imperial'
}

interface Props {
  initialStep: OnboardingStep
  locale: Locale
  /** Present once the household exists (steps from `translation` on). */
  household?: OnboardingHousehold
  categories?: ShoppingCategory[]
  rules?: ShoppingRule[]
}

export function OnboardingWizard({ initialStep, locale, household, categories = [], rules = [] }: Props) {
  const t = useTranslations('auth')
  const router = useRouter()
  const posthog = usePostHog()
  const [step, setStep] = useState<OnboardingStep>(initialStep)
  const [error, setError] = useState<string | null>(null)

  function track(completed: OnboardingStep, skipped: boolean) {
    posthog?.capture('onboarding_step_completed', { step: completed, skipped })
  }

  /** Leaves `current`. Persisted steps record where to resume before moving on. */
  async function advance(current: OnboardingStep, skipped = false) {
    setError(null)
    if (isPersistedStep(current)) {
      const ok = await sendJson('PATCH', '/api/household', { onboarding_step: persistedStepAfter(current) })
      if (!ok) {
        setError(t('onboarding.saveError'))
        return
      }
    }
    track(current, skipped)
    setStep(nextStep(current))
  }

  const next = () => advance(step)
  const skip = () => advance(step, true)
  const number = stepNumber(step)

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-semibold text-gray-900 font-fraunces">
            <span className="text-emerald-700">{t('onboarding.headingW')}</span>
            {t('onboarding.headingRest')}
          </h1>
          {number > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500">{t('onboarding.progress', { current: number, total: TOTAL_STEPS })}</p>
              <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 transition-all" style={{ width: `${(number / TOTAL_STEPS) * 100}%` }} />
              </div>
            </div>
          )}
        </div>

        {step === 'language' && <LanguageStep onNext={next} />}

        {step === 'intro' && (
          <StepFrame title={t('onboarding.intro.title')} onNext={next} nextLabel={t('onboarding.intro.start')}>
            <p className="text-sm text-gray-600">{t('onboarding.intro.body')}</p>
            <p className="text-sm text-gray-500">{t('onboarding.intro.settingsNote')}</p>
          </StepFrame>
        )}

        {step === 'household' && <HouseholdStep onSubmit={() => track('household', false)} />}

        {step === 'translation' && household && (
          <TranslationStep
            onNext={next}
            onSkip={skip}
            initialEnabled={household.translationEnabled}
            initialLanguage={household.preferredLanguage}
            defaultLanguage={locale}
          />
        )}

        {step === 'units' && household && (
          <UnitsStep onNext={next} onSkip={skip} initialUnits={household.preferredUnits} />
        )}

        {step === 'tags' && <TagsStep onNext={next} onSkip={skip} locale={locale} />}

        {step === 'shopping_categories' && (
          <StepFrame
            title={t('onboarding.shoppingCategories.title')}
            help={t('onboarding.shoppingCategories.help')}
            onNext={next}
            onSkip={skip}
            settingsNote
          >
            <ShoppingCategoriesEditor initialCategories={categories} />
          </StepFrame>
        )}

        {step === 'shopping_rules' && (
          <StepFrame
            title={t('onboarding.shoppingRules.title')}
            help={t('onboarding.shoppingRules.help')}
            onNext={next}
            onSkip={skip}
            settingsNote
          >
            <ShoppingRulesEditor
              initialRules={rules}
              suggestions={SHOPPING_RULE_EXAMPLES.map((rule) => rule[locale])}
              suggestionsLabel={t('onboarding.shoppingRules.examplesLabel')}
            />
          </StepFrame>
        )}

        {step === 'done' && (
          <StepFrame
            title={t('onboarding.done.title')}
            onNext={() => router.push('/recipes?ob=1')}
            nextLabel={t('onboarding.done.cta')}
          >
            <p className="text-sm text-gray-600">{t('onboarding.done.body')}</p>
          </StepFrame>
        )}

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  )
}
