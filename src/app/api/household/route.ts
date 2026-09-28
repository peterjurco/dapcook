import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_LANGUAGE_CODES } from '@/lib/constants/languages'
import { getCurrentUser } from '@/lib/auth/current-user'
import { getCurrentHouseholdId } from '@/lib/auth/household'
import { isPersistedStep } from '@/lib/onboarding/steps'
import { forgetOnboardingStep } from '@/lib/onboarding/status'

export async function PATCH(request: NextRequest) {
  const supabase = createClient()
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = await getCurrentHouseholdId()
  if (!householdId) return NextResponse.json({ error: 'No household' }, { status: 403 })

  const body = await request.json() as {
    preferred_units?: 'metric' | 'imperial'
    preferred_language?: string
    translation_enabled?: boolean
    name?: unknown
    onboarding_step?: unknown
  }

  const updates: Record<string, unknown> = {}
  if (body.preferred_units !== undefined) {
    if (!['metric', 'imperial'].includes(body.preferred_units)) {
      return NextResponse.json({ error: 'Invalid preferred_units' }, { status: 400 })
    }
    updates.preferred_units = body.preferred_units
  }

  if (body.preferred_language !== undefined) {
    if (!VALID_LANGUAGE_CODES.includes(body.preferred_language)) {
      return NextResponse.json({ error: 'Invalid preferred_language' }, { status: 400 })
    }
    updates.preferred_language = body.preferred_language
  }

  if (body.translation_enabled !== undefined) {
    if (typeof body.translation_enabled !== 'boolean') {
      return NextResponse.json({ error: 'Invalid translation_enabled' }, { status: 400 })
    }
    updates.translation_enabled = body.translation_enabled
  }

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 80) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    }
    updates.name = name
  }

  if (body.onboarding_step !== undefined) {
    if (body.onboarding_step !== null && !isPersistedStep(body.onboarding_step)) {
      return NextResponse.json({ error: 'Invalid onboarding_step' }, { status: 400 })
    }
    updates.onboarding_step = body.onboarding_step
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('households')
    .update(updates)
    .eq('id', householdId)
    .select()
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed' }, { status: 500 })

  if ('onboarding_step' in updates) forgetOnboardingStep(householdId)

  return NextResponse.json(data)
}
