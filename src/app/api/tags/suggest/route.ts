import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'
import { loadHouseholdTagNames } from '@/lib/tags/household-tags'
import { suggestTags, EMPTY_TAG_SUGGESTIONS } from '@/lib/ai/suggest-tags'

const MAX_TITLE_CHARS = 200

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Guard: the tag field fires this on focus, so without the flag every form visit would cost an AI call.
  if (process.env.TAG_SUGGEST_USE_AI !== 'true') return NextResponse.json(EMPTY_TAG_SUGGESTIONS)

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json(EMPTY_TAG_SUGGESTIONS)

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; ingredientNames?: unknown }
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE_CHARS) : ''
  if (!title) return NextResponse.json(EMPTY_TAG_SUGGESTIONS)

  const ingredientNames = Array.isArray(body.ingredientNames)
    ? body.ingredientNames
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean)
    : []

  const [householdTags, { data: household }] = await Promise.all([
    loadHouseholdTagNames(supabase, householdId),
    supabase.from('households').select('preferred_language').eq('id', householdId).single(),
  ])

  const suggestions = await suggestTags({
    title,
    ingredientNames,
    householdTags,
    language: household?.preferred_language ?? 'en',
    householdId,
  })
  return NextResponse.json(suggestions)
}
