// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

// Creates a query builder that is awaitable and supports .single()
function makeQB(result: { data: unknown; error: null | { message: string } }) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

interface MockResult { data: unknown; error: null | { message: string } }
function makeSupabase({
  user = mockUser as typeof mockUser | null,
  recipesResult = { data: [] as unknown[], error: null } as MockResult,
  profileResult = { data: { household_id: 'hh-1' }, error: null } as MockResult,
  insertResult = { data: null as unknown, error: null } as MockResult,
} = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'recipes') return makeQB(table === 'recipes' && insertResult.data !== null ? insertResult : recipesResult)
      if (table === 'profiles') return makeQB(profileResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(url: string, opts?: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(`http://localhost${url}`, opts as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/recipes', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await GET(req('/api/recipes'))
    expect(res.status).toBe(401)
  })

  it('returns recipes list for authenticated user', async () => {
    const recipes = [{ id: 'r1', title: 'Pasta' }]
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ recipesResult: { data: recipes, error: null } }) as unknown as ReturnType<typeof createClient>
    )
    const res = await GET(req('/api/recipes'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(recipes)
  })

  it('applies search filter on the normalized title', async () => {
    const supabase = makeSupabase({ recipesResult: { data: [], error: null } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
    await GET(req('/api/recipes?search=pasta'))
    const qb = supabase.from.mock.results[0].value
    expect(qb.ilike).toHaveBeenCalledWith('title_normalized', '%pasta%')
  })

  it('strips diacritics and lowercases the search term', async () => {
    const supabase = makeSupabase({ recipesResult: { data: [], error: null } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
    await GET(req(`/api/recipes?search=${encodeURIComponent('Café')}`))
    const qb = supabase.from.mock.results[0].value
    expect(qb.ilike).toHaveBeenCalledWith('title_normalized', '%cafe%')
  })

  it('applies tag filter', async () => {
    const supabase = makeSupabase({ recipesResult: { data: [], error: null } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
    await GET(req('/api/recipes?tag=vegan'))
    const qb = supabase.from.mock.results[0].value
    expect(qb.contains).toHaveBeenCalledWith('tags', ['vegan'])
  })

  it('returns 500 when DB query fails', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ recipesResult: { data: null, error: { message: 'db error' } } }) as unknown as ReturnType<typeof createClient>
    )
    const res = await GET(req('/api/recipes'))
    expect(res.status).toBe(500)
  })
})

describe('POST /api/recipes', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('/api/recipes', { method: 'POST', body: JSON.stringify({ title: 'Test' }) }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user has no household', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ profileResult: { data: { household_id: null }, error: null } }) as unknown as ReturnType<typeof createClient>
    )
    const res = await POST(req('/api/recipes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Test' }),
    }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when title is missing', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('/api/recipes', {
      method: 'POST',
      body: JSON.stringify({ description: 'no title here' }),
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Title')
  })

  it('creates recipe and returns 201', async () => {
    const created = { id: 'r-new', title: 'Lasagne', household_id: 'hh-1' }
    const supabase = makeSupabase({ insertResult: { data: created, error: null } })
    // Override from to use insertResult for recipes
    supabase.from = vi.fn((table: string) => {
      if (table === 'profiles') return makeQB({ data: { household_id: 'hh-1' }, error: null })
      if (table === 'recipes') return makeQB({ data: created, error: null })
      throw new Error(`Unexpected: ${table}`)
    })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await POST(req('/api/recipes', {
      method: 'POST',
      body: JSON.stringify({ title: 'Lasagne', tags: ['italian'], servings: 4 }),
    }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)
  })

  it('passes ingredients and steps to insert', async () => {
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return makeQB({ data: { household_id: 'hh-1' }, error: null })
        if (table === 'recipes') return makeQB({ data: { id: 'r1', title: 'Test' }, error: null })
        throw new Error(`Unexpected: ${table}`)
      }),
    }
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    await POST(req('/api/recipes', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test',
        ingredients: [{ id: 'i1', quantity: 200, unit: 'g', name: 'flour', notes: '' }],
        steps: [{ id: 's1', order: 1, text: 'Mix it' }],
      }),
    }))

    const recipeQB = supabase.from.mock.results[1].value
    const insertCall = recipeQB.insert.mock.calls[0][0] as Record<string, unknown>
    expect(insertCall.title).toBe('Test')
    expect(insertCall.ingredients).toEqual([{ id: 'i1', quantity: 200, unit: 'g', name: 'flour', notes: '' }])
  })
})
