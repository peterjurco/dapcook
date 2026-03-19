import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Ingredient, Step } from '@/types/recipe'

export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search')
  const tag = searchParams.get('tag')

  let query = supabase
    .from('recipes')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }
  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('household_id')
    .eq('id', user.id)
    .single()

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'No household' }, { status: 403 })
  }

  const body = await request.json() as {
    title: string
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

  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('recipes')
    .insert({
      household_id: profile.household_id,
      created_by: user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      source_url: body.source_url?.trim() || null,
      image_url: body.image_url?.trim() || null,
      prep_time_min: body.prep_time_min ?? null,
      cook_time_min: body.cook_time_min ?? null,
      servings: body.servings ?? null,
      tags: body.tags ?? [],
      ingredients: (body.ingredients ?? []) as unknown as import('@/types/database').Json,
      steps: (body.steps ?? []) as unknown as import('@/types/database').Json,
      notes: body.notes?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
