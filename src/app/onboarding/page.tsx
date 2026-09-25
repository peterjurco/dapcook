import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { defaultLocale, isLocale } from '@/i18n/config'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { isPersistedStep } from '@/lib/onboarding/steps'
import { selectionFromSavedTags } from '@/lib/onboarding/tag-catalog'

export default async function OnboardingPage() {
  const profile = await getCurrentProfile()
  const locale = isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale

  if (!profile?.household_id) {
    return <OnboardingWizard key="new" initialStep="language" locale={locale} />
  }

  const supabase = createClient()
  const [{ data: household }, { data: categories }, { data: rules }, { data: tagGroups }, { data: tags }] = await Promise.all([
    supabase
      .from('households')
      .select('onboarding_step, created_by, invite_token, translation_enabled, preferred_language, preferred_units')
      .eq('id', profile.household_id)
      .single(),
    supabase.from('shopping_categories').select('*').eq('household_id', profile.household_id).order('sort_order'),
    supabase.from('shopping_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
    supabase.from('tag_groups').select('id, name').eq('household_id', profile.household_id).order('position'),
    supabase.from('tags').select('name, group_id').eq('household_id', profile.household_id).order('created_at'),
  ])

  if (!household?.onboarding_step || household.created_by !== profile.id) redirect('/recipes')

  const savedTags = (tagGroups ?? []).map((group) => ({
    name: group.name,
    tags: (tags ?? []).filter((tag) => tag.group_id === group.id).map((tag) => tag.name),
  }))

  // Keyed by household so the wizard remounts (and picks up `initialStep`)
  // when createHousehold redirects back here.
  return (
    <OnboardingWizard
      key={profile.household_id}
      initialStep={isPersistedStep(household.onboarding_step) ? household.onboarding_step : 'done'}
      locale={locale}
      household={{
        translationEnabled: household.translation_enabled,
        preferredLanguage: household.preferred_language,
        preferredUnits: household.preferred_units,
      }}
      categories={categories ?? []}
      rules={rules ?? []}
      tags={selectionFromSavedTags(savedTags, locale)}
    />
  )
}
