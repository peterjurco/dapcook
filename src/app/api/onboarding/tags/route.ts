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

  const body = await request.json() as { groups?: unknown; previous?: unknown }
  const groups = parseGroups(body.groups)
  const previous = parseGroups(body.previous ?? [])
  if (!groups || !previous) return NextResponse.json({ error: 'Invalid groups' }, { status: 400 })

  const { data: household, error: householdError } = await supabase
    .from('households')
    .select('onboarding_step, created_by')
    .eq('id', householdId)
    .single()
  if (householdError) return NextResponse.json({ error: householdError.message }, { status: 500 })
  if (!household?.onboarding_step) return NextResponse.json({ error: 'Onboarding finished' }, { status: 409 })
  if (household.created_by !== user.id) return NextResponse.json({ error: 'Not the household creator' }, { status: 403 })

  // Only what the wizard saved last time (`previous`) may be removed: people who
  // joined mid-wizard can already have tags of their own.
  const keptTags = new Set(groups.flatMap((group) => group.tags))
  const keptGroups = new Set(groups.map((group) => group.name))
  const removedTags = previous.flatMap((group) => group.tags).filter((name) => !keptTags.has(name))
  const removedGroups = previous.map((group) => group.name).filter((name) => !keptGroups.has(name))

  // delete_tag also strips the name from recipe tag arrays, keeping them consistent.
  const tagResults = await Promise.all(
    removedTags.map((name) => supabase.rpc('delete_tag', { p_household_id: householdId, p_name: name }))
  )
  const tagError = tagResults.find((result) => result.error)?.error
  if (tagError) return NextResponse.json({ error: tagError.message }, { status: 500 })

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

  // After the upserts, so a tag moved to another group no longer counts as remaining.
  if (removedGroups.length > 0) {
    const cleanupError = await deleteEmptyGroups(supabase, householdId, removedGroups)
    if (cleanupError) return NextResponse.json({ error: cleanupError }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}

/** Deletes the named groups that no longer hold any tag; returns an error message on failure. */
async function deleteEmptyGroups(
  supabase: ReturnType<typeof createClient>,
  householdId: string,
  names: string[]
): Promise<string | null> {
  const { data: candidates, error: groupsError } = await supabase
    .from('tag_groups')
    .select('id, name')
    .eq('household_id', householdId)
    .in('name', names)
  if (groupsError) return groupsError.message
  const ids = (candidates ?? []).map((group) => group.id)
  if (ids.length === 0) return null

  const { data: members, error: membersError } = await supabase
    .from('tags')
    .select('group_id')
    .eq('household_id', householdId)
    .in('group_id', ids)
  if (membersError) return membersError.message
  const occupied = new Set((members ?? []).map((tag) => tag.group_id))
  const empty = ids.filter((id) => !occupied.has(id))
  if (empty.length === 0) return null

  const { error } = await supabase.from('tag_groups').delete().eq('household_id', householdId).in('id', empty)
  return error?.message ?? null
}
