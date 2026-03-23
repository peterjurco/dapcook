import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Ingredient, Step } from '@/types/recipe'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const { data, error } = await supabase
    .from('recipes')
    .update({
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.description !== undefined && { description: body.description.trim() || null }),
      ...(body.source_url !== undefined && { source_url: body.source_url.trim() || null }),
      ...(body.image_url !== undefined && { image_url: body.image_url.trim() || null }),
      ...(body.prep_time_min !== undefined && { prep_time_min: body.prep_time_min }),
      ...(body.cook_time_min !== undefined && { cook_time_min: body.cook_time_min }),
      ...(body.servings !== undefined && { servings: body.servings }),
      ...(body.tags !== undefined && { tags: body.tags }),
      ...(body.ingredients !== undefined && { ingredients: body.ingredients as unknown as import('@/types/database').Json }),
      ...(body.steps !== undefined && { steps: body.steps as unknown as import('@/types/database').Json }),
      ...(body.notes !== undefined && { notes: body.notes.trim() || null }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .select()
    .single()

  console.log('[PUT /api/recipes/:id] supabase result — error:', error?.message ?? null, '| data id:', data?.id ?? null)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Soft delete — archive instead of removing
  const { error } = await supabase
    .from('recipes')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
