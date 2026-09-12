import { getLocale } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatRelativeTime } from '@/lib/utils/format'

interface HouseholdRow {
  id: string
  name: string
  created_at: string
  last_sign_in_at: string | null
  recipe_count: number
  total_input_tokens: number
  total_output_tokens: number
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

// Priced at claude-sonnet-4-5 rates: $3/MTok input, $15/MTok output
function formatCost(inputTokens: number, outputTokens: number): string {
  const cost = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15
  return `$${cost.toFixed(4)}`
}

export default async function AdminPage() {
  const locale = await getLocale()
  const adminClient = createAdminClient()

  // All queries use the service role client — ai_usage_logs has no SELECT policy for regular users
  const { data: households } = await adminClient
    .from('households')
    .select(`
      id, name, created_at, last_sign_in_at,
      recipes(id, is_archived),
      ai_usage_logs(input_tokens, output_tokens)
    `)
    .order('last_sign_in_at', { ascending: false, nullsFirst: false })

  // Fetch member emails via service role (accesses auth.users)
  const { data: profiles } = await adminClient
    .from('profiles')
    .select('household_id, id')

  const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })

  // Build a map of household_id → emails
  const emailsByHousehold = new Map<string, string[]>()
  for (const profile of profiles ?? []) {
    if (!profile.household_id) continue
    const authUser = users.find((u) => u.id === profile.id)
    if (!authUser?.email) continue
    const list = emailsByHousehold.get(profile.household_id) ?? []
    list.push(authUser.email)
    emailsByHousehold.set(profile.household_id, list)
  }

  const rows: HouseholdRow[] = (households ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    created_at: h.created_at,
    last_sign_in_at: h.last_sign_in_at,
    recipe_count: Array.isArray(h.recipes) ? h.recipes.filter((r: { is_archived: boolean }) => !r.is_archived).length : 0,
    total_input_tokens: Array.isArray(h.ai_usage_logs)
      ? h.ai_usage_logs.reduce((sum: number, l: { input_tokens: number }) => sum + l.input_tokens, 0)
      : 0,
    total_output_tokens: Array.isArray(h.ai_usage_logs)
      ? h.ai_usage_logs.reduce((sum: number, l: { output_tokens: number }) => sum + l.output_tokens, 0)
      : 0,
  }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Admin — Households</h1>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">Household</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Members</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Recipes</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Last sign-in</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">AI tokens</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.id}
                className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
              >
                <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {(emailsByHousehold.get(row.id) ?? []).join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">{row.recipe_count}</td>
                <td
                  className="px-4 py-3 text-gray-600"
                  title={row.last_sign_in_at ?? undefined}
                >
                  {formatRelativeTime(
                    row.last_sign_in_at
                      ? Math.floor((Date.now() - new Date(row.last_sign_in_at).getTime()) / 60_000)
                      : null,
                    locale
                  )}
                </td>
                <td className="px-4 py-3 text-right text-gray-600 font-mono text-xs">
                  {formatTokens(row.total_input_tokens)} in / {formatTokens(row.total_output_tokens)} out
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatCost(row.total_input_tokens, row.total_output_tokens)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No households yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
