import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { locales, isLocale } from '@/i18n/config'
import type { Database } from '@/types/database'
import { getCurrentUser } from '@/lib/auth/current-user'
import { isTourId } from '@/lib/tours/ids'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    default_recipe_filter?: unknown
    ui_language?: unknown
    tour_seen?: unknown
  }

  if (body.default_recipe_filter === undefined && body.ui_language === undefined && body.tour_seen === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  if (body.tour_seen !== undefined && !isTourId(body.tour_seen)) {
    return NextResponse.json({ error: 'tour_seen must be a known tour id' }, { status: 400 })
  }

  const update: ProfileUpdate = {}

  if (body.default_recipe_filter !== undefined) {
    if (
      !Array.isArray(body.default_recipe_filter) ||
      !body.default_recipe_filter.every((v) => typeof v === 'string')
    ) {
      return NextResponse.json({ error: 'default_recipe_filter must be an array of strings' }, { status: 400 })
    }
    update.default_recipe_filter = body.default_recipe_filter
  }

  if (body.ui_language !== undefined) {
    const candidate = typeof body.ui_language === 'string' ? body.ui_language : undefined
    if (!isLocale(candidate)) {
      return NextResponse.json({ error: 'ui_language must be one of: ' + locales.join(', ') }, { status: 400 })
    }
    update.ui_language = candidate
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (isTourId(body.tour_seen)) {
    const { error } = await supabase.rpc('mark_tour_seen', { p_tour: body.tour_seen })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
