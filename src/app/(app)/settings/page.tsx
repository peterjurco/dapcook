import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteLink } from '@/components/settings/InviteLink'
import { PlannerRulesEditor } from '@/components/settings/PlannerRulesEditor'
import { TagOrganizer } from '@/components/settings/TagOrganizer'
import { ShoppingCategoriesEditor } from '@/components/settings/ShoppingCategoriesEditor'
import { ShoppingRulesEditor } from '@/components/settings/ShoppingRulesEditor'
import { UnitPreferenceSelector } from '@/components/settings/UnitPreferenceSelector'
import { TranslationSettings } from '@/components/settings/TranslationSettings'
import { InterfaceLanguageSelector } from '@/components/settings/InterfaceLanguageSelector'
import { signOut } from '@/lib/auth/actions'
import type { TagData } from '@/app/api/tags/route'
import { buildTagMeta } from '@/lib/tags/taxonomy'
import { getTranslations } from 'next-intl/server'
import { isLocale, defaultLocale } from '@/i18n/config'

export default async function SettingsPage() {
  const supabase = createClient()
  const t = await getTranslations('settings')

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile?.household_id) redirect('/onboarding')

  const [{ data: household }, { data: members }, { data: plannerRules }, { data: recipes }, { data: tagsMeta }, { data: shoppingCategories }, { data: shoppingRules }, { data: tagGroups }] = await Promise.all([
    supabase.from('households').select('*').eq('id', profile.household_id).single(),
    supabase.from('profiles').select('*').eq('household_id', profile.household_id),
    supabase.from('planner_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
    supabase.from('recipes').select('id, tags').eq('household_id', profile.household_id).eq('is_archived', false),
    supabase.from('tags').select('name, color, group_id').eq('household_id', profile.household_id),
    supabase.from('shopping_categories').select('*').eq('household_id', profile.household_id).order('sort_order'),
    supabase.from('shopping_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
    supabase.from('tag_groups').select('*').eq('household_id', profile.household_id).order('position'),
  ])

  // Compute tag usage counts server-side
  const tagCounts = new Map<string, number>()
  for (const r of recipes ?? []) {
    for (const tag of r.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const meta = buildTagMeta(tagsMeta ?? [])
  const allTags: TagData[] = Array.from(tagCounts.entries())
    .map(([name, count]) => ({
      name,
      color: meta[name]?.color ?? null,
      groupId: meta[name]?.groupId ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count)
  for (const tag of tagsMeta ?? []) {
    if (!tagCounts.has(tag.name)) {
      allTags.push({ name: tag.name, color: tag.color, groupId: tag.group_id, count: 0 })
    }
  }

  const recipeIds = (recipes ?? []).map((r) => r.id)

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const inviteUrl = `${origin}/join/${household?.invite_token}`

  return (
    <div className="max-w-xl mx-auto px-6 pt-6 pb-10 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900 font-fraunces">
        <span className="text-emerald-700">{t('page.headingS')}</span>{t('page.headingRest')}
      </h1>

      {/* Your account */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('account.heading')}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
          <p className="text-xs text-gray-500 mb-1">{t('account.interfaceLanguage')}</p>
          <p className="text-xs text-gray-400 mb-2">{t('account.interfaceLanguageHelp')}</p>
          <InterfaceLanguageSelector initialValue={isLocale(profile?.ui_language) ? profile.ui_language : defaultLocale} />
        </div>
      </section>

      {/* Household */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('page.household')}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div>
            <p className="text-xs text-gray-500 mb-1">{t('page.name')}</p>
            <p className="text-sm font-medium text-gray-900">{household?.name}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">{t('page.translationLabel')}</p>
            <p className="text-xs text-gray-400 mb-2">
              {t('page.translationHelp')}
            </p>
            <TranslationSettings
              initialEnabled={household?.translation_enabled ?? false}
              initialLanguage={household?.preferred_language ?? 'en'}
              currentPreferredUnits={household?.preferred_units ?? 'metric'}
              recipeIds={recipeIds}
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">{t('page.unitsLabel')}</p>
            <p className="text-xs text-gray-400 mb-2">
              {t('page.unitsHelp')}
            </p>
            <UnitPreferenceSelector
              initialValue={household?.preferred_units ?? 'metric'}
              currentPreferredLanguage={household?.preferred_language ?? 'en'}
              translationEnabled={household?.translation_enabled ?? false}
              recipeIds={recipeIds}
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">{t('page.inviteLinkLabel')}</p>
            <p className="text-xs text-gray-400 mb-2">
              {t('page.inviteLinkHelp')}
            </p>
            <InviteLink url={inviteUrl} />
          </div>
        </div>
      </section>

      {/* Tags */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('page.tags')}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            {t('page.tagsHelp')}
          </p>
          <TagOrganizer initialGroups={tagGroups ?? []} initialTags={allTags} />
        </div>
      </section>

      {/* Shopping categories */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('page.shoppingCategories')}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            {t('page.shoppingCategoriesHelp')}
          </p>
          <ShoppingCategoriesEditor initialCategories={shoppingCategories ?? []} />
        </div>
      </section>

      {/* Shopping rules */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('page.shoppingRules')}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            {t('page.shoppingRulesHelp')}
          </p>
          <ShoppingRulesEditor initialRules={shoppingRules ?? []} />
        </div>
      </section>

      {/* Planner rules */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">{t('page.plannerRules')}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            {t('page.plannerRulesHelp')}
          </p>
          <PlannerRulesEditor initialRules={plannerRules ?? []} />
        </div>
      </section>

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          {t('page.members', { count: members?.length ?? 0 })}
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {members?.map((member) => (
            <div key={member.id} className="flex items-center gap-3 px-5 py-3">
              {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.avatar_url}
                  alt={member.display_name ?? t('page.memberFallbackAlt')}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                  {(member.display_name ?? 'U')[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {member.display_name ?? t('page.memberFallbackName')}
                  {member.id === user.id && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">{t('page.you')}</span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sign out — visible on mobile where sidebar is hidden */}
      <section className="md:hidden">
        <form action={signOut}>
          <button
            type="submit"
            className="w-full bg-white border border-gray-200 rounded-xl px-5 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors text-left"
          >
            {t('page.signOut')}
          </button>
        </form>
      </section>
    </div>
  )
}
