// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE, POST } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/recipes/share-token', () => ({ createShareToken: vi.fn() }))

import { createShareToken } from '@/lib/recipes/share-token'
import { createClient } from '@/lib/supabase/server'

const mockUser = { id: 'user-1' }
const params = { params: { id: 'r-1' } }

type QueryResult = {
  data: unknown
  error: null | { code?: string; message: string }
}

function makeQB(result: QueryResult) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
}

function makeSupabase(
  user: typeof mockUser | null = mockUser,
  results: QueryResult[] = []
) {
  const builders = results.map(makeQB)

  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    from: vi.fn((table: string) => {
      if (table !== 'recipes') throw new Error(`Unexpected table: ${table}`)
      const builder = builders.shift()
      if (!builder) throw new Error('Unexpected recipes query')
      return builder
    }),
  }
}

function req(method: 'POST' | 'DELETE') {
  return new NextRequest('https://dapcook.test/api/recipes/r-1/share', { method })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createShareToken).mockReset()
  vi.mocked(createShareToken)
    .mockReturnValueOnce('token-one')
    .mockReturnValueOnce('token-two')
    .mockReturnValueOnce('token-three')
    .mockReturnValueOnce('token-four')
})

describe('POST /api/recipes/[id]/share', () => {
  it('returns 401 for unauthenticated POST', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(null) as unknown as ReturnType<typeof createClient>
    )

    const response = await POST(req('POST'), params)

    expect(response.status).toBe(401)
  })

  it('returns 404 when POST cannot select the recipe through RLS', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, [{ data: null, error: null }]) as unknown as ReturnType<typeof createClient>
    )

    const response = await POST(req('POST'), params)

    expect(response.status).toBe(404)
  })

  it('returns the existing token without updating', async () => {
    const supabase = makeSupabase(mockUser, [
      { data: { id: 'r-1', share_token: 'existing-token' }, error: null },
    ])
    vi.mocked(createClient).mockReturnValue(
      supabase as unknown as ReturnType<typeof createClient>
    )

    const response = await POST(req('POST'), params)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      share_token: 'existing-token',
      share_url: 'https://dapcook.test/s/existing-token',
    })
    expect(createShareToken).not.toHaveBeenCalled()
    expect(supabase.from).toHaveBeenCalledTimes(1)
  })

  it('creates a token and an absolute /s/ URL', async () => {
    const supabase = makeSupabase(mockUser, [
      { data: { id: 'r-1', share_token: null }, error: null },
      { data: { share_token: 'token-one' }, error: null },
    ])
    vi.mocked(createClient).mockReturnValue(
      supabase as unknown as ReturnType<typeof createClient>
    )

    const response = await POST(req('POST'), params)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      share_token: 'token-one',
      share_url: 'https://dapcook.test/s/token-one',
    })
    const updateBuilder = supabase.from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ share_token: 'token-one' })
    expect(updateBuilder.is).toHaveBeenCalledWith('share_token', null)
  })

  it('retries a 23505 unique violation with a new token', async () => {
    const supabase = makeSupabase(mockUser, [
      { data: { id: 'r-1', share_token: null }, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: { share_token: 'token-two' }, error: null },
    ])
    vi.mocked(createClient).mockReturnValue(
      supabase as unknown as ReturnType<typeof createClient>
    )

    const response = await POST(req('POST'), params)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      share_token: 'token-two',
      share_url: 'https://dapcook.test/s/token-two',
    })
    expect(createShareToken).toHaveBeenCalledTimes(2)
    expect(supabase.from.mock.results[1].value.update).toHaveBeenCalledWith({
      share_token: 'token-one',
    })
    expect(supabase.from.mock.results[2].value.update).toHaveBeenCalledWith({
      share_token: 'token-two',
    })
  })

  it('returns 500 after three token collisions', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, [
        { data: { id: 'r-1', share_token: null }, error: null },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
      ]) as unknown as ReturnType<typeof createClient>
    )

    const response = await POST(req('POST'), params)

    expect(response.status).toBe(500)
    expect(createShareToken).toHaveBeenCalledTimes(3)
  })
})

describe('DELETE /api/recipes/[id]/share', () => {
  it('returns 401 for unauthenticated DELETE', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(null) as unknown as ReturnType<typeof createClient>
    )

    const response = await DELETE(req('DELETE'), params)

    expect(response.status).toBe(401)
  })

  it('clears an active token and returns 204', async () => {
    const supabase = makeSupabase(mockUser, [{ data: { id: 'r-1' }, error: null }])
    vi.mocked(createClient).mockReturnValue(
      supabase as unknown as ReturnType<typeof createClient>
    )

    const response = await DELETE(req('DELETE'), params)

    expect(response.status).toBe(204)
    const updateBuilder = supabase.from.mock.results[0].value
    expect(updateBuilder.update).toHaveBeenCalledWith({ share_token: null })
  })

  it('returns 404 when DELETE cannot update the recipe through RLS', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeSupabase(mockUser, [{ data: null, error: null }]) as unknown as ReturnType<typeof createClient>
    )

    const response = await DELETE(req('DELETE'), params)

    expect(response.status).toBe(404)
  })
})
