import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { default_recipe_filter?: unknown }

  if (body.default_recipe_filter === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
  if (
    !Array.isArray(body.default_recipe_filter) ||
    !body.default_recipe_filter.every((v) => typeof v === 'string')
  ) {
    return NextResponse.json({ error: 'default_recipe_filter must be an array of strings' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ default_recipe_filter: body.default_recipe_filter as string[] })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
