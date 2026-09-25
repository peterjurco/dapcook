// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: vi.fn() }))
import { createClient } from '@/lib/supabase/server'

const profileUpdate = vi.fn()

function makeQB(result: unknown) {
  const qb: Record<string, unknown> = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnThis(),
    update: vi.fn((values: unknown) => {
      profileUpdate(values)
      return qb
    }),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: (onfulfilled?: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(onfulfilled),
  }
  return qb
}

function makeSupabase(householdId: string | null, inviteRows: unknown[] = []) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'a@b.c', user_metadata: {} } },
        error: null,
      }),
    },
    from: vi.fn(() => makeQB({ data: { household_id: householdId }, error: null })),
    rpc: vi.fn().mockResolvedValue({ data: inviteRows, error: null }),
  }
}

function useSupabase(supabase: ReturnType<typeof makeSupabase>) {
  vi.mocked(createClient).mockReturnValue(supabase as unknown as ReturnType<typeof createClient>)
}

function callback({ next, cookie }: { next?: string; cookie?: string } = {}) {
  const url = new URL('https://dapcook.vercel.app/auth/callback?code=abc')
  if (next !== undefined) url.searchParams.set('next', next)
  return GET(new NextRequest(url, { headers: cookie ? { cookie } : {} }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /auth/callback', () => {
  it('redirects to a same-origin next path', async () => {
    useSupabase(makeSupabase('h-1'))
    const res = await callback({ next: '/join/xyz' })
    expect(res.headers.get('location')).toBe('https://dapcook.vercel.app/join/xyz')
  })

  it.each(['@evil.com', '//evil.com', '/\\evil.com', 'https://evil.com'])(
    'ignores malicious next %j and falls back to /recipes',
    async (next) => {
      useSupabase(makeSupabase('h-1'))
      const res = await callback({ next })
      const location = res.headers.get('location')!
      expect(location).toBe('https://dapcook.vercel.app/recipes')
      expect(new URL(location).host).toBe('dapcook.vercel.app')
    }
  )

  it('sends users without a household to onboarding even with a malicious next', async () => {
    useSupabase(makeSupabase(null))
    const res = await callback({ next: '@evil.com' })
    expect(res.headers.get('location')).toBe('https://dapcook.vercel.app/onboarding')
  })

  it('puts an invitee into the household and reports a join', async () => {
    useSupabase(makeSupabase(null, [{ id: 'hh-1', name: 'Home' }]))
    const res = await callback({ cookie: 'pending_invite_token=tok' })
    expect(profileUpdate).toHaveBeenCalledWith({ household_id: 'hh-1' })
    expect(res.headers.get('location')).toBe('https://dapcook.vercel.app/recipes?ob=1&obm=join')
    expect(res.cookies.get('pending_invite_token')?.value).toBe('')
  })

  it('sends an invitee with a dead invite to the invalid-invite page instead of onboarding', async () => {
    useSupabase(makeSupabase(null, []))
    const res = await callback({ cookie: 'pending_invite_token=stale' })
    expect(res.headers.get('location')).toBe('https://dapcook.vercel.app/join-invalid')
    expect(res.cookies.get('pending_invite_token')?.value).toBe('')
    expect(profileUpdate).not.toHaveBeenCalled()
  })
})
