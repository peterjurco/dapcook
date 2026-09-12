// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/ai/transform-recipe', () => ({ transformRecipe: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => mockTranslate(namespace, key),
}))

import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'

const mockUser = { id: 'user-1' }

function makeSingleChain(resolvedData: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: resolvedData }),
  }
}

function makeSupabase(
  user: typeof mockUser | null = mockUser,
  profile: { household_id: string | null; ui_language?: string | null } | null = { household_id: 'hh-1' },
  household: { preferred_language: string; preferred_units: string } | null = { preferred_language: 'en', preferred_units: 'metric' }
) {
  const fromMap: Record<string, unknown> = {
    profiles: makeSingleChain(profile),
    households: makeSingleChain(household),
  }
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => fromMap[table] ?? makeSingleChain(null)),
  }
}

function req(body: unknown) {
  return new NextRequest('http://localhost/api/recipes/translate-draft', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
})

describe('POST /api/recipes/translate-draft', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req({ content: {} }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user has no household', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, { household_id: null }) as unknown as ReturnType<typeof createClient>
    )
    const res = await POST(req({ content: {} }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when content is missing', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('content')
  })

  it('returns translated content on success', async () => {
    const translated = { title: 'Preložený recept', description: null, ingredients: [], steps: [], notes: null }
    vi.mocked(transformRecipe).mockResolvedValue(translated)
    const res = await POST(req({ content: { title: 'Recipe', description: null, ingredients: [], steps: [], notes: null } }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ content: translated })
  })

  it('returns categorized translationError when transformRecipe throws', async () => {
    vi.mocked(transformRecipe).mockRejectedValue(new Error('429 rate_limit'))
    const res = await POST(req({ content: { title: 'Recipe', description: null, ingredients: [], steps: [], notes: null } }))
    expect(res.status).toBe(200)
    const body = await res.json() as { translationError: { type: string } }
    expect(body.translationError.type).toBe('rate_limit')
  })
})
