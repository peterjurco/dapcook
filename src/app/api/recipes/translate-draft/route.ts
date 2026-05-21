import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import { categorizeTranslationError } from '@/lib/ai/translation-error'
import type { RecipeContent } from '@/lib/ai/transform-recipe'

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('household_id').eq('id', user.id).single()

  if (!profile?.household_id) {
    return NextResponse.json({ error: 'No household' }, { status: 403 })
  }

  const { data: household } = await supabase
    .from('households')
    .select('preferred_language, preferred_units')
    .eq('id', profile.household_id)
    .single()

  const body = await request.json() as { content?: RecipeContent }

  if (!body.content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  try {
    const translated = await transformRecipe(
      body.content,
      {
        targetLanguage: household?.preferred_language ?? 'en',
        targetUnits: household?.preferred_units ?? 'metric',
      },
      profile.household_id
    )
    return NextResponse.json({ content: translated })
  } catch (err) {
    return NextResponse.json({ translationError: categorizeTranslationError(err) }, { status: 200 })
  }
}
