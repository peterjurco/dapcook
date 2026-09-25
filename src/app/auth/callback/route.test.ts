// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  householdId: null as string | null,
  rpc: vi.fn(),
  profileUpdate: vi.fn(),
}))

vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      exchangeCodeForSession: vi.fn(async () => ({
        data: { user: { id: 'user-1', email: 'a@b.c', user_metadata: {} } },
        error: null,
      })),
    },
    from: () => ({
      upsert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ single: async () => ({ data: { household_id: mocks.householdId }, error: null }) }) }),
      update: (values: unknown) => {
        mocks.profileUpdate(values)
        return { eq: async () => ({ error: null }) }
      },
    }),
    rpc: mocks.rpc,
  }),
}))

import { GET } from './route'

function callback(cookie?: string) {
  return GET(
    new NextRequest('https://dapcook.test/auth/callback?code=abc', {
      headers: cookie ? { cookie } : {},
    })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.householdId = null
})

describe('GET /auth/callback', () => {
  it('puts an invitee into the household and reports a join', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: 'hh-1', name: 'Home' }], error: null })
    const res = await callback('pending_invite_token=tok')
    expect(mocks.profileUpdate).toHaveBeenCalledWith({ household_id: 'hh-1' })
    expect(res.headers.get('location')).toBe('https://dapcook.test/recipes?ob=1&obm=join')
    expect(res.cookies.get('pending_invite_token')?.value).toBe('')
  })

  it('sends an invitee with a dead invite to the invalid-invite page instead of onboarding', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    const res = await callback('pending_invite_token=stale')
    expect(res.headers.get('location')).toBe('https://dapcook.test/join-invalid')
    expect(res.cookies.get('pending_invite_token')?.value).toBe('')
    expect(mocks.profileUpdate).not.toHaveBeenCalled()
  })

  it('sends a new user without an invite to onboarding', async () => {
    const res = await callback()
    expect(res.headers.get('location')).toBe('https://dapcook.test/onboarding')
  })
})
