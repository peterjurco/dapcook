// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { PATCH, DELETE } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
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
  profileResult = { data: { household_id: 'hh-1' }, error: null } as MockResult,
  groupResult = { data: { id: 'g1' }, error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB(profileResult)
      if (table === 'tag_groups') return makeQB(groupResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

function req(body?: unknown) {
  return new NextRequest('http://localhost/api/tag-groups/g1', {
    method: 'PATCH',
    body: JSON.stringify(body ?? {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

const params = { params: { id: 'g1' } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PATCH /api/tag-groups/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ name: 'x' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the body has no updatable field', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({}), params)
    expect(res.status).toBe(400)
  })

  it('updates the name, trimmed', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ name: '  Course  ' }), params)
    expect(res.status).toBe(200)

    const qb = supabase.from.mock.results[1].value
    expect(qb.update).toHaveBeenCalledWith({ name: 'Course' })
    expect(qb.eq).toHaveBeenCalledWith('id', 'g1')
    expect(qb.eq).toHaveBeenCalledWith('household_id', 'hh-1')
  })

  it('updates name and position together', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    await PATCH(req({ name: 'Course', position: 2 }), params)

    const qb = supabase.from.mock.results[1].value
    expect(qb.update).toHaveBeenCalledWith({ name: 'Course', position: 2 })
  })

  it('rejects an empty name', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await PATCH(req({ name: '   ' }), params)
    expect(res.status).toBe(400)
  })

  it('treats position 0 as a provided value, not a missing one', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    await PATCH(req({ position: 0 }), params)

    const qb = supabase.from.mock.results[1].value
    expect(qb.update).toHaveBeenCalledWith({ position: 0 })
  })

  it('returns 404 when the group does not exist or belongs to another household', async () => {
    const supabase = makeSupabase({ groupResult: { data: null, error: null } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await PATCH(req({ name: 'x' }), params)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/tag-groups/[id]', () => {
  it('returns 204 and deletes only from tag_groups', async () => {
    const supabase = makeSupabase()
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await DELETE(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new NextRequest('http://localhost/api/tag-groups/g1', { method: 'DELETE' } as any),
      params
    )

    expect(res.status).toBe(204)

    const touched = supabase.from.mock.calls.map((c) => c[0])
    expect(touched).toEqual(['profiles', 'tag_groups'])
    expect(touched).not.toContain('recipes')
    expect(touched).not.toContain('tags')

    const qb = supabase.from.mock.results[1].value
    expect(qb.delete).toHaveBeenCalled()
    expect(qb.eq).toHaveBeenCalledWith('id', 'g1')
    expect(qb.eq).toHaveBeenCalledWith('household_id', 'hh-1')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await DELETE(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new NextRequest('http://localhost/api/tag-groups/g1', { method: 'DELETE' } as any),
      params
    )
    expect(res.status).toBe(401)
  })
})
