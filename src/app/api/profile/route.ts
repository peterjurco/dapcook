import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { locales, type Locale } from '@/i18n/config'
import type { Database } from '@/types/database'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as {
    default_recipe_filter?: unknown
    ui_language?: unknown
  }

  if (body.default_recipe_filter === undefined && body.ui_language === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
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
    if (typeof body.ui_language !== 'string' || !locales.includes(body.ui_language as Locale)) {
      return NextResponse.json({ error: 'ui_language must be one of: ' + locales.join(', ') }, { status: 400 })
    }
    update.ui_language = body.ui_language as Locale
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
