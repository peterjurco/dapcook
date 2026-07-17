import { NextRequest, NextResponse } from 'next/server'
import { createShareToken } from '@/lib/recipes/share-token'
import { createClient } from '@/lib/supabase/server'

const MAX_TOKEN_ATTEMPTS = 3

function shareResponse(request: NextRequest, token: string) {
  return NextResponse.json({
    share_token: token,
    share_url: new URL(`/s/${token}`, request.nextUrl.origin).toString(),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: recipe, error: readError } = await supabase
    .from('recipes')
    .select('id, share_token')
    .eq('id', params.id)
    .maybeSingle()

  if (readError) return NextResponse.json({ error: 'Unable to share recipe' }, { status: 500 })
  if (!recipe) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (recipe.share_token) return shareResponse(request, recipe.share_token)

  for (let attempt = 0; attempt < MAX_TOKEN_ATTEMPTS; attempt += 1) {
    const token = createShareToken()
    const { data, error } = await supabase
      .from('recipes')
      .update({ share_token: token })
      .eq('id', params.id)
      .is('share_token', null)
      .select('share_token')
      .maybeSingle()

    if (data?.share_token) return shareResponse(request, data.share_token)
    if (error?.code === '23505') continue
    if (error) return NextResponse.json({ error: 'Unable to share recipe' }, { status: 500 })

    const { data: concurrent } = await supabase
      .from('recipes')
      .select('share_token')
      .eq('id', params.id)
      .maybeSingle()
    if (concurrent?.share_token) return shareResponse(request, concurrent.share_token)
  }

  return NextResponse.json({ error: 'Unable to share recipe' }, { status: 500 })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('recipes')
    .update({ share_token: null })
    .eq('id', params.id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: 'Unable to disable sharing' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
