// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
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
  groupsResult = { data: [] as unknown[], error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB(profileResult)
      if (table === 'tag_groups') return makeQB(groupsResult)
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

describe('GET /api/tag-groups', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase({ user: null }) as unknown as ReturnType<typeof createClient>)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 403 when the user has no household', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase({ profileResult: { data: { household_id: null }, error: null } }) as unknown as ReturnType<typeof createClient>
    )
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns the household groups ordered by position', async () => {
    const groups = [{ id: 'g1', name: 'Course', position: 0 }]
    const supabase = makeSupabase({ groupsResult: { data: groups, error: null } })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(groups)

    const qb = supabase.from.mock.results[1].value
    expect(qb.order).toHaveBeenCalledWith('position')
  })
})

describe('POST /api/tag-groups', () => {
  it('returns 400 when name is missing', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase() as unknown as ReturnType<typeof createClient>)
    const res = await POST(req('/api/tag-groups', { method: 'POST', body: JSON.stringify({}) }))
    expect(res.status).toBe(400)
  })

  it('creates a group at the start of the ordering and returns 201', async () => {
    const created = { id: 'g-new', name: 'Cuisine', position: -1 }
    const supabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
      from: vi.fn((table: string) => {
        if (table === 'profiles') return makeQB({ data: { household_id: 'hh-1' }, error: null })
        if (table === 'tag_groups') return makeQB({ data: created, error: null })
        throw new Error(`Unexpected table: ${table}`)
      }),
    }
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await POST(req('/api/tag-groups', {
      method: 'POST',
      body: JSON.stringify({ name: '  Cuisine  ' }),
    }))

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(created)

    // New groups are always visible, so they're prepended (lowest position first),
    // not appended.
    const positionQB = supabase.from.mock.results[1].value
    expect(positionQB.order).toHaveBeenCalledWith('position', { ascending: true })

    const insertQB = supabase.from.mock.results[2].value
    const inserted = insertQB.insert.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.name).toBe('Cuisine')
    expect(inserted.household_id).toBe('hh-1')
  })
})
