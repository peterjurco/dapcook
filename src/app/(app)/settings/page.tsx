import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { InviteLink } from '@/components/settings/InviteLink'

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

  const [{ data: household }, { data: members }] = await Promise.all([
    supabase.from('households').select('*').eq('id', profile.household_id).single(),
    supabase.from('profiles').select('*').eq('household_id', profile.household_id),
  ])

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
            <p className="text-xs text-gray-500 mb-2">Invite link</p>
            <p className="text-xs text-gray-400 mb-2">
              Share this link with your partner to join this household.
            </p>
            <InviteLink url={inviteUrl} />
          </div>
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
    </div>
  )
}
