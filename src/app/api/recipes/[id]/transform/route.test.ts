// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/ai/transform-recipe', () => ({ transformRecipe: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { transformRecipe } from '@/lib/ai/transform-recipe'
import type { RecipeContent } from '@/lib/ai/transform-recipe'

const mockUser = { id: 'user-1' }
const mockRecipe = {
  id: 'r-1',
  household_id: 'hh-1',
  title: 'Pasta',
  description: 'Yummy',
  notes: null,
  ingredients: [{ id: 'i1', quantity: 200, unit: 'g', name: 'pasta', notes: '' }],
  steps: [{ id: 's1', order: 1, text: 'Boil pasta.' }],
}

function makeQB(result: { data: unknown; error: null | { message: string } }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function makeSupabase({
  user = mockUser as typeof mockUser | null,
  recipe = mockRecipe as unknown,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'recipes') return makeQB({ data: recipe, error: null })
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(id: string, body: unknown) {
  return new NextRequest(`http://localhost/api/recipes/${id}/transform`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

const params = { params: { id: 'r-1' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(transformRecipe).mockImplementation(async (content) => content)
})

describe('POST /api/recipes/[id]/transform', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 404 when recipe not found', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ recipe: null }) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid targetLanguage', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('r-1', { targetLanguage: 'klingon' }), params)
    expect(res.status).toBe(400)
  })

  it('calls transformRecipe with recipe content and options', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    await POST(req('r-1', { targetLanguage: 'sk', targetUnits: 'metric' }), params)

    expect(vi.mocked(transformRecipe)).toHaveBeenCalledWith(
      {
        title: 'Pasta',
        description: 'Yummy',
        ingredients: mockRecipe.ingredients,
        steps: mockRecipe.steps,
        notes: null,
      },
      { targetLanguage: 'sk', targetUnits: 'metric' },
      'hh-1'
    )
  })

  it('returns 200 with updated recipe on success', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const transformed: RecipeContent = {
      title: 'Cestoviny',
      description: 'Chutné',
      ingredients: [{ id: 'i1', quantity: 200, unit: 'g', name: 'cestoviny', notes: '' }],
      steps: [{ id: 's1', order: 1, text: 'Varte cestoviny.' }],
      notes: null,
    }
    vi.mocked(transformRecipe).mockResolvedValue(transformed)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(200)
  })

  it('returns 500 when DB update fails', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'recipes') {
          // First call (SELECT) returns recipe, second call (UPDATE) returns error
          let callCount = 0
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(() => {
              callCount++
              if (callCount === 1) return Promise.resolve({ data: mockRecipe, error: null })
              return Promise.resolve({ data: null, error: { message: 'DB error' } })
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('r-1', { targetLanguage: 'sk' }), params)
    expect(res.status).toBe(500)
  })
})
