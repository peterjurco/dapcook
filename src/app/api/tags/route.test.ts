// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }

interface MockResult { data: unknown; error: null | { message: string } }

function makeQB(result: MockResult) {
  const qb: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return qb
}

function makeSupabase({
  recipesResult = { data: [] as unknown[], error: null } as MockResult,
  tagsResult = { data: [] as unknown[], error: null } as MockResult,
} = {}) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: vi.fn((table: string) => {
      if (table === 'profiles') return makeQB({ data: { household_id: 'hh-1' }, error: null })
      if (table === 'recipes') return makeQB(recipesResult)
      if (table === 'tags') return makeQB(tagsResult)
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/tags', () => {
  it('returns each tag with its colour and group id', async () => {
    const supabase = makeSupabase({
      recipesResult: { data: [{ tags: ['main', 'quick'] }, { tags: ['main'] }], error: null },
      tagsResult: { data: [{ name: 'main', color: '#ef4444', group_id: 'g-course' }], error: null },
    })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { name: 'main', color: '#ef4444', groupId: 'g-course', count: 2 },
      { name: 'quick', color: null, groupId: null, count: 1 },
    ])
  })

  it('includes unused tags that carry metadata', async () => {
    const supabase = makeSupabase({
      recipesResult: { data: [], error: null },
      tagsResult: { data: [{ name: 'orphan', color: null, group_id: 'g-course' }], error: null },
    })
    vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)

    const res = await GET()
    expect(await res.json()).toEqual([
      { name: 'orphan', color: null, groupId: 'g-course', count: 0 },
    ])
  })
})
