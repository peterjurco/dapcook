import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteLink } from '@/components/settings/InviteLink'
import { PlannerRulesEditor } from '@/components/settings/PlannerRulesEditor'
import { TagsEditor } from '@/components/settings/TagsEditor'
import { ShoppingCategoriesEditor } from '@/components/settings/ShoppingCategoriesEditor'
import { ShoppingRulesEditor } from '@/components/settings/ShoppingRulesEditor'
import { UnitPreferenceSelector } from '@/components/settings/UnitPreferenceSelector'
import { TranslationSettings } from '@/components/settings/TranslationSettings'
import { signOut } from '@/lib/auth/actions'
import type { TagData } from '@/app/api/tags/route'

export default async function SettingsPage() {
  const supabase = createClient()

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

  const [{ data: household }, { data: members }, { data: plannerRules }, { data: recipes }, { data: tagsMeta }, { data: shoppingCategories }, { data: shoppingRules }] = await Promise.all([
    supabase.from('households').select('*').eq('id', profile.household_id).single(),
    supabase.from('profiles').select('*').eq('household_id', profile.household_id),
    supabase.from('planner_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
    supabase.from('recipes').select('id, tags').eq('household_id', profile.household_id).eq('is_archived', false),
    supabase.from('tags').select('name, color').eq('household_id', profile.household_id),
    supabase.from('shopping_categories').select('*').eq('household_id', profile.household_id).order('sort_order'),
    supabase.from('shopping_rules').select('*').eq('household_id', profile.household_id).order('created_at'),
  ])

  // Compute tag usage counts server-side
  const tagCounts = new Map<string, number>()
  for (const r of recipes ?? []) {
    for (const tag of r.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const colorMap = new Map((tagsMeta ?? []).map((t) => [t.name, t.color]))
  const allTags: TagData[] = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, color: colorMap.get(name) ?? null, count }))
    .sort((a, b) => b.count - a.count)
  for (const t of tagsMeta ?? []) {
    if (!tagCounts.has(t.name)) allTags.push({ name: t.name, color: t.color, count: 0 })
  }

  const recipeIds = (recipes ?? []).map((r) => r.id)

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const inviteUrl = `${origin}/join/${household?.invite_token}`

  return (
    <div className="max-w-xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-xl font-semibold text-gray-900">Settings</h1>

      {/* Household */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Household</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          <div>
            <p className="text-xs text-gray-500 mb-1">Name</p>
            <p className="text-sm font-medium text-gray-900">{household?.name}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">Translation</p>
            <p className="text-xs text-gray-400 mb-2">
              When enabled, recipes are translated to your chosen language on import. Existing recipes can be updated via bulk translate.
            </p>
            <TranslationSettings
              initialEnabled={household?.translation_enabled ?? false}
              initialLanguage={household?.preferred_language ?? 'en'}
              currentPreferredUnits={household?.preferred_units ?? 'metric'}
              recipeIds={recipeIds}
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">Preferred units</p>
            <p className="text-xs text-gray-400 mb-2">
              Applied when importing new recipes.
            </p>
            <UnitPreferenceSelector
              initialValue={household?.preferred_units ?? 'metric'}
              currentPreferredLanguage={household?.preferred_language ?? 'en'}
              translationEnabled={household?.translation_enabled ?? false}
              recipeIds={recipeIds}
            />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-2">Invite link</p>
            <p className="text-xs text-gray-400 mb-2">
              Share this link with anyone you want to join this household.
            </p>
            <InviteLink url={inviteUrl} />
          </div>
        </div>
      </section>

      {/* Tags */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Tags</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            Assign colors, rename, or remove tags. Renaming or deleting updates all recipes.
          </p>
          <TagsEditor initialTags={allTags} />
        </div>
      </section>

      {/* Shopping categories */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Shopping categories</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            Categories group items on your shopping list. Order them to match your supermarket layout. If none are defined, the AI will generate them automatically.
          </p>
          <ShoppingCategoriesEditor initialCategories={shoppingCategories ?? []} />
        </div>
      </section>

      {/* Shopping rules */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Shopping rules</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            These rules are passed to the AI when generating a shopping list. Use them to exclude ingredients or adjust how items are merged.
          </p>
          <ShoppingRulesEditor initialRules={shoppingRules ?? []} />
        </div>
      </section>

      {/* Planner rules */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Planner rules</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-4">
            Planner rules will guide the AI when it generates weekly plans — coming soon.
          </p>
          <PlannerRulesEditor initialRules={plannerRules ?? []} />
        </div>
      </section>

      {/* Members */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Members ({members?.length ?? 0})
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {members?.map((member) => (
            <div key={member.id} className="flex items-center gap-3 px-5 py-3">
              {member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.avatar_url}
                  alt={member.display_name ?? 'Member'}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                  {(member.display_name ?? 'U')[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {member.display_name ?? 'Unknown'}
                  {member.id === user.id && (
                    <span className="ml-2 text-xs text-gray-400 font-normal">you</span>
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
            Sign out
          </button>
        </form>
      </section>
    </div>
  )
}
