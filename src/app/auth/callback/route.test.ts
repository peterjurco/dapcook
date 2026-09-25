// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

function makeQB(result: unknown) {
  const qb: Record<string, unknown> = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (onfulfilled?: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(onfulfilled),
  }
  return qb
}

function makeSupabase(householdId: string | null) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'a@b.c', user_metadata: {} } },
        error: null,
      }),
    },
    from: vi.fn(() => makeQB({ data: { household_id: householdId }, error: null })),
    rpc: vi.fn(),
  }
}

function callback(next?: string) {
  const url = new URL('https://dapcook.vercel.app/auth/callback?code=abc')
  if (next !== undefined) url.searchParams.set('next', next)
  return GET(new NextRequest(url))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('GET /auth/callback', () => {
  it('redirects to a same-origin next path', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase('h-1') as unknown as ReturnType<typeof createClient>)
    const res = await callback('/join/xyz')
    expect(res.headers.get('location')).toBe('https://dapcook.vercel.app/join/xyz')
  })

  it.each(['@evil.com', '//evil.com', '/\\evil.com', 'https://evil.com'])(
    'ignores malicious next %j and falls back to /recipes',
    async (next) => {
      vi.mocked(createClient).mockReturnValue(makeSupabase('h-1') as unknown as ReturnType<typeof createClient>)
      const res = await callback(next)
      const location = res.headers.get('location')!
      expect(location).toBe('https://dapcook.vercel.app/recipes')
      expect(new URL(location).host).toBe('dapcook.vercel.app')
    }
  )

  it('sends users without a household to onboarding even with a malicious next', async () => {
    vi.mocked(createClient).mockReturnValue(makeSupabase(null) as unknown as ReturnType<typeof createClient>)
    const res = await callback('@evil.com')
    expect(res.headers.get('location')).toBe('https://dapcook.vercel.app/onboarding')
  })
})
