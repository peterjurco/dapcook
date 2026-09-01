import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildTagMeta } from '@/lib/tags/taxonomy'

export interface TagData {
  name: string
  color: string | null
  groupId: string | null
  count: number
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const [{ data: recipes }, { data: tagsMeta }] = await Promise.all([
    supabase.from('recipes').select('tags').eq('household_id', profile.household_id).eq('is_archived', false),
    supabase.from('tags').select('name, color, group_id').eq('household_id', profile.household_id),
  ])

  // Count usage per tag
  const counts = new Map<string, number>()
  for (const recipe of recipes ?? []) {
    for (const tag of recipe.tags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  const meta = buildTagMeta(tagsMeta ?? [])

  const result: TagData[] = Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      color: meta[name]?.color ?? null,
      groupId: meta[name]?.groupId ?? null,
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // Also include tags with metadata but 0 usage (in case they were just coloured or grouped)
  for (const t of tagsMeta ?? []) {
    if (!counts.has(t.name)) {
      result.push({ name: t.name, color: t.color, groupId: t.group_id, count: 0 })
    }
  }

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()
  if (!profile?.household_id) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { name: string; color?: string | null }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('tags')
    .upsert({ household_id: profile.household_id, name: body.name.trim(), color: body.color ?? null },
      { onConflict: 'household_id,name' })
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
