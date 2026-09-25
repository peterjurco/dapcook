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
  previousStep,
  stepNumber,
  TOTAL_STEPS,
  type OnboardingStep,
} from '@/lib/onboarding/steps'
import { SHOPPING_RULE_EXAMPLES } from '@/lib/onboarding/defaults'
import type { TagSelection } from '@/lib/onboarding/tag-catalog'
import { ShoppingCategoriesEditor } from '@/components/settings/ShoppingCategoriesEditor'
import { ShoppingRulesEditor } from '@/components/settings/ShoppingRulesEditor'
import { StepFrame } from './StepFrame'
import { sendJson } from './send-json'
import { LanguageStep } from './steps/LanguageStep'
import { HouseholdStep } from './steps/HouseholdStep'
import { TranslationStep, type TranslationAnswer } from './steps/TranslationStep'
import { UnitsStep, type Units } from './steps/UnitsStep'
import { TagsStep } from './steps/TagsStep'

export interface OnboardingHousehold {
  translationEnabled: boolean
  preferredLanguage: string
  preferredUnits: Units
}

interface Props {
  initialStep: OnboardingStep
  locale: Locale
  /** Present once the household exists (steps from `translation` on). */
  household?: OnboardingHousehold
  categories?: ShoppingCategory[]
  rules?: ShoppingRule[]
  /** Tags already saved for the household, mapped onto the catalog. */
  tags?: TagSelection
}

const NO_TAGS: TagSelection = { selected: {}, custom: {} }

export function OnboardingWizard({ initialStep, locale, household, categories = [], rules = [], tags = NO_TAGS }: Props) {
  const t = useTranslations('auth')
  const router = useRouter()
  const posthog = usePostHog()
  const [step, setStep] = useState<OnboardingStep>(initialStep)
  const [error, setError] = useState<string | null>(null)
  // Answers live here, not in the steps, so they survive going back and forth.
  const [translation, setTranslation] = useState<TranslationAnswer>(() => ({
    enabled: household?.translationEnabled ?? false,
    // With translation off, suggest the interface language as the target.
    language: household?.translationEnabled ? household.preferredLanguage : locale,
  }))
  const [units, setUnits] = useState<Units>(household?.preferredUnits ?? 'metric')
  const [tagSelection, setTagSelection] = useState<TagSelection>(tags)
  const [shoppingCategories, setShoppingCategories] = useState<ShoppingCategory[]>(categories)

  function track(completed: OnboardingStep, skipped: boolean) {
    posthog?.capture('onboarding_step_completed', { step: completed, skipped })
  }

  /**
   * Leaves `current`. Persisted steps record where to resume before moving on, except
   * `invite`: its stored step stays put until the Done screen's own PATCH, so
   * closing/refreshing on Done still lands back on Done instead of skipping it.
   */
  async function advance(current: OnboardingStep, skipped = false) {
    setError(null)
    if (isPersistedStep(current) && current !== 'invite') {
      const ok = await sendJson('PATCH', '/api/household', { onboarding_step: persistedStepAfter(current) })
      if (!ok) {
        setError(t('onboarding.saveError'))
        return
      }
    }
    track(current, skipped)
    setStep(nextStep(current))
  }

  async function finish() {
    setError(null)
    const ok = await sendJson('PATCH', '/api/household', { onboarding_step: null })
    if (!ok) {
      setError(t('onboarding.saveError'))
      return
    }
    router.push('/recipes?ob=1')
  }

  /** Client-side only: the stored step stays the furthest one reached. */
  function back() {
    setError(null)
    setStep(previousStep(step))
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
          <StepFrame title={t('onboarding.intro.title')} onNext={next} onBack={back} nextLabel={t('onboarding.intro.start')}>
            <p className="text-sm text-gray-600">{t('onboarding.intro.body')}</p>
            <p className="text-sm text-gray-500">{t('onboarding.intro.settingsNote')}</p>
          </StepFrame>
        )}

        {step === 'household' && <HouseholdStep onSubmit={() => track('household', false)} onBack={back} />}

        {step === 'translation' && household && (
          <TranslationStep value={translation} onSaved={setTranslation} onNext={next} onSkip={skip} />
        )}

        {step === 'units' && household && (
          <UnitsStep value={units} onSaved={setUnits} onNext={next} onSkip={skip} onBack={back} />
        )}

        {step === 'tags' && (
          <TagsStep
            value={tagSelection}
            onSaved={setTagSelection}
            onNext={next}
            onSkip={skip}
            onBack={back}
            locale={locale}
          />
        )}

        {step === 'shopping_categories' && (
          <StepFrame
            title={t('onboarding.shoppingCategories.title')}
            help={t('onboarding.shoppingCategories.help')}
            onNext={next}
            onSkip={skip}
            onBack={back}
            settingsNote
          >
            <ShoppingCategoriesEditor initialCategories={shoppingCategories} onCategoriesChange={setShoppingCategories} />
          </StepFrame>
        )}

        {step === 'invite' && (
          <StepFrame
            title={t('onboarding.shoppingRules.title')}
            help={t('onboarding.shoppingRules.help')}
            onNext={next}
            onSkip={skip}
            onBack={back}
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
          <StepFrame title={t('onboarding.done.title')} onNext={finish} nextLabel={t('onboarding.done.cta')}>
            <p className="text-sm text-gray-600">{t('onboarding.done.body')}</p>
          </StepFrame>
        )}

        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      </div>
    </div>
  )
}
