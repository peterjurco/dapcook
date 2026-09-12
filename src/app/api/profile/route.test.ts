// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
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

function makeSupabase({
  user = mockUser as typeof mockUser | null,
  profileResult = { data: null, error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB(profileResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(body: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new NextRequest('http://localhost/api/profile', { method: 'PATCH', body: JSON.stringify(body) } as any)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/profile', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ default_recipe_filter: ['main'] }))
    expect(res.status).toBe(401)
  })

  it('stores the default filter for the current user only', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ default_recipe_filter: ['main', 'italian'] }))
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[0].value
    expect(qb.update).toHaveBeenCalledWith({ default_recipe_filter: ['main', 'italian'] })
    expect(qb.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('accepts an empty array to clear the default', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ default_recipe_filter: [] }))
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[0].value
    expect(qb.update).toHaveBeenCalledWith({ default_recipe_filter: [] })
  })

  it('returns 400 when default_recipe_filter is not an array of strings', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ default_recipe_filter: 'main' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the body has no updatable field', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({}))
    expect(res.status).toBe(400)
  })

  it('stores a valid ui_language for the current user only', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ ui_language: 'sk' }))
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[0].value
    expect(qb.update).toHaveBeenCalledWith({ ui_language: 'sk' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('returns 400 when ui_language is not a recognized locale', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ ui_language: 'fr' }))
    expect(res.status).toBe(400)
  })

  it('updates both fields when both are provided', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ default_recipe_filter: ['main'], ui_language: 'en' }))
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[0].value
    expect(qb.update).toHaveBeenCalledWith({ default_recipe_filter: ['main'], ui_language: 'en' })
  })
})
