import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'
import type { TagGroupPayload } from '@/lib/onboarding/tag-catalog'

const MAX_NAME_LENGTH = 50
const MAX_GROUPS = 10
const MAX_TAGS = 100

/**
 * Validates the wizard's payload. Empty groups are dropped, and since tag names
 * are unique per household a name claimed by an earlier group is not repeated.
 * Names are capped at 50 characters, and the payload at 10 groups / 100 tags
 * total, to keep a malicious or buggy client from writing unbounded rows.
 */
function parseGroups(value: unknown): TagGroupPayload[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > MAX_GROUPS) return null

  const seen = new Set<string>()
  const groups: TagGroupPayload[] = []
  let tagCount = 0
  for (const raw of value) {
    const group = raw as { name?: unknown; tags?: unknown }
    if (typeof group?.name !== 'string' || !Array.isArray(group.tags)) return null
    const groupName = group.name.trim()
    if (!groupName || groupName.length > MAX_NAME_LENGTH) return null

    const tags: string[] = []
    for (const tag of group.tags) {
      if (typeof tag !== 'string') continue
      const name = tag.trim()
      if (!name) continue
      if (name.length > MAX_NAME_LENGTH) return null
      if (seen.has(name)) continue
      seen.add(name)
      tags.push(name)
    }
    tagCount += tags.length
    if (tagCount > MAX_TAGS) return null
    if (tags.length > 0) groups.push({ name: groupName, tags })
  }
  return groups
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as { groups?: unknown }
  const groups = parseGroups(body.groups)
  if (!groups) return NextResponse.json({ error: 'Invalid groups' }, { status: 400 })

  // Upserts keep a retried step (e.g. after a dropped connection) from failing on unique names.
  for (const [position, group] of Array.from(groups.entries())) {
    const { data: row, error: groupError } = await supabase
      .from('tag_groups')
      .upsert({ household_id: householdId, name: group.name, position }, { onConflict: 'household_id,name' })
      .select('id')
      .single()
    if (groupError || !row) return NextResponse.json({ error: groupError?.message ?? 'Failed' }, { status: 500 })

    const { error: tagsError } = await supabase
      .from('tags')
      .upsert(
        group.tags.map((name) => ({ household_id: householdId, name, group_id: row.id })),
        { onConflict: 'household_id,name' }
      )
    if (tagsError) return NextResponse.json({ error: tagsError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
