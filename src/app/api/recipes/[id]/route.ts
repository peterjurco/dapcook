import { NextResponse, type NextRequest } from 'next/server'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { defaultLocale } from '@/i18n/config'
import { getUserTranslations } from '@/i18n/server-utils'
import type { Ingredient, Step } from '@/types/recipe'
import { getCurrentUser } from '@/lib/auth/current-user'
import { storeCoverImage, coverToRemove, removeStoredCover } from '@/lib/recipes/cover-image'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ui_language')
    .eq('id', user.id)
    .single()

  const t = await getUserTranslations(profile, 'errors')

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: t('notFound') }, { status: 404 })

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('ui_language')
    .eq('id', user.id)
    .single()

  const t = await getUserTranslations(profile, 'errors')

  const body = await request.json() as {
    title?: string
    description?: string
    source_url?: string
    image_url?: string
    prep_time_min?: number | null
    cook_time_min?: number | null
    servings?: number | null
    tags?: string[]
    ingredients?: Ingredient[]
    steps?: Step[]
    notes?: string
  }

  // A cover swapped in on edit gets mirrored into our bucket, same as on create.
  const sourceCover = body.image_url?.trim() || null
  const nextCover = sourceCover ? await storeCoverImage(sourceCover, { supabase }) : null

  // Read the cover being replaced before it is overwritten, so the object it
  // points at can be cleaned up once the new one is safely saved.
  let previousCover: string | null = null
  if (body.image_url !== undefined) {
    const { data: current } = await supabase
      .from('recipes')
      .select('image_url')
      .eq('id', params.id)
      .single()
    previousCover = current?.image_url ?? null
  }

  const { data, error } = await supabase
    .from('recipes')
    .update({
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.source_url !== undefined && { source_url: body.source_url?.trim() || null }),
      ...(body.image_url !== undefined && { image_url: nextCover }),
      ...(body.prep_time_min !== undefined && { prep_time_min: body.prep_time_min }),
      ...(body.cook_time_min !== undefined && { cook_time_min: body.cook_time_min }),
      ...(body.servings !== undefined && { servings: body.servings }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.ingredients !== undefined && { ingredients: body.ingredients as unknown as import('@/types/database').Json }),
      ...(body.steps !== undefined && { steps: body.steps as unknown as import('@/types/database').Json }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? t('notFound') }, { status: 404 })

  // Only now that the new cover is saved: drop the old object, unless another
  // recipe still points at it. Importing from a dapcook share link reuses the
  // stored URL rather than copying it, so covers can genuinely be shared.
  const stale = coverToRemove(previousCover, nextCover)
  if (stale) {
    const { data: stillUsed } = await supabase
      .from('recipes')
      .select('id')
      .eq('image_url', previousCover as string)
      .limit(1)

    if (!stillUsed?.length) await removeStoredCover(stale, { supabase })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) {
    const t = await getTranslations({ locale: defaultLocale, namespace: 'errors' })
    return NextResponse.json({ error: t('unauthorized') }, { status: 401 })
  }

  // Soft delete — archive instead of removing
  const { error } = await supabase
    .from('recipes')
    .update({
      is_archived: true,
      share_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
