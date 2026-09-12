// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PUT, DELETE } from './route'
import { mockTranslate } from '@/test/mockMessages'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace: string }) => (key: string) => mockTranslate(namespace, key),
}))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }
const mockRecipe = { id: 'r-1', title: 'Pasta', is_archived: false }
const mockProfile = { data: { ui_language: 'en' }, error: null }

function makeQB(result: { data: unknown; error: null | { message: string } }) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

function makeSupabase(user: typeof mockUser | null = mockUser, fromFn?: (table: string) => unknown) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn(fromFn ?? ((table: string) => {
      if (table === 'recipes') return makeQB({ data: mockRecipe, error: null })
      if (table === 'profiles') return makeQB(mockProfile)
      throw new Error(`Unexpected table: ${table}`)
    })),
  }
}

const params = { params: { id: 'r-1' } }

function req(url: string, opts?: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest(`http://localhost${url}`, opts as any)
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/recipes/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await GET(req('/api/recipes/r-1'), params)
    expect(res.status).toBe(401)
  })

  it('returns recipe when found', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await GET(req('/api/recipes/r-1'), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockRecipe)
  })

  it('returns 404 when recipe not found', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, () => makeQB({ data: null, error: { message: 'Not found' } })) as unknown as ReturnType<typeof createClient>
    )
    const res = await GET(req('/api/recipes/r-1'), params)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/recipes/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await PUT(req('/api/recipes/r-1', { method: 'PUT', body: JSON.stringify({ title: 'New' }) }), params)
    expect(res.status).toBe(401)
  })

  it('returns updated recipe', async () => {
    const updated = { ...mockRecipe, title: 'Updated Pasta' }
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, () => makeQB({ data: updated, error: null })) as unknown as ReturnType<typeof createClient>
    )
    const res = await PUT(req('/api/recipes/r-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'Updated Pasta' }),
    }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updated)
  })

  it('returns 404 when recipe not found', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, () => makeQB({ data: null, error: { message: 'Not found' } })) as unknown as ReturnType<typeof createClient>
    )
    const res = await PUT(req('/api/recipes/r-1', {
      method: 'PUT',
      body: JSON.stringify({ title: 'X' }),
    }), params)
    expect(res.status).toBe(404)
  })

  it('only sends provided fields to update', async () => {
    const supabase = makeSupabase(mockUser, () => makeQB({ data: mockRecipe, error: null }))
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    await PUT(req('/api/recipes/r-1', {
      method: 'PUT',
      body: JSON.stringify({ tags: ['quick'] }),
    }), params)

    const qb = supabase.from.mock.results[1].value
    const updateArg = qb.update.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.tags).toEqual(['quick'])
    expect(updateArg.title).toBeUndefined()
  })
})

describe('DELETE /api/recipes/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(req('/api/recipes/r-1'), params)
    expect(res.status).toBe(401)
  })

  it('soft-deletes recipe and returns 204', async () => {
    const supabase = makeSupabase(mockUser, () => makeQB({ data: null, error: null }))
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(req('/api/recipes/r-1'), params)
    expect(res.status).toBe(204)
  })

  it('sets is_archived=true on soft delete', async () => {
    const supabase = makeSupabase(mockUser, () => makeQB({ data: null, error: null }))
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    await DELETE(req('/api/recipes/r-1'), params)

    const qb = supabase.from.mock.results[0].value
    const updateArg = qb.update.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg.is_archived).toBe(true)
    expect(updateArg.share_token).toBeNull()
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, () => makeQB({ data: null, error: { message: 'db error' } })) as unknown as ReturnType<typeof createClient>
    )
    const res = await DELETE(req('/api/recipes/r-1'), params)
    expect(res.status).toBe(500)
  })
})
