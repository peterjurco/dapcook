import { signInWithGoogleForJoin } from '@/lib/auth/actions'
import { createClient } from '@/lib/supabase/server'

export default async function JoinPage({ params }: { params: { token: string } }) {
  const { token } = params
  const supabase = createClient()

  const { data } = await supabase.rpc('get_household_invite_details', { token })
  const household = data?.[0] ?? null

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-sm w-full space-y-8 p-8 text-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Join dapcook</h1>

          {household ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">
                You&apos;ve been invited to join
              </p>
              <p className="text-lg font-semibold text-gray-900">{household.name}</p>

              {household.members.length > 0 && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  {household.members.map((member, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      {member.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={member.avatar_url}
                          alt={member.display_name ?? 'Member'}
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                          {(member.display_name ?? 'U')[0].toUpperCase()}
                        </div>
                      )}
                      <span className="text-sm text-gray-600">{member.display_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              You&apos;ve been invited to a household. Sign in with Google to accept.
            </p>
          )}
        </div>

        {household ? (
          <form action={signInWithGoogleForJoin.bind(null, token)}>
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Sign in with Google to accept
            </button>
          </form>
        ) : (
          <p className="text-sm text-red-600">This invite link is invalid or has expired.</p>
        )}
      </div>
    </div>
  )
}
