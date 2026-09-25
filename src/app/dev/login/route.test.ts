// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
  profileUpsert: vi.fn(),
  adminUpdateEq: vi.fn(),
  adminUpdate: vi.fn(),
  forgetHouseholdId: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: mocks.createUser, generateLink: mocks.generateLink } },
    from: () => ({ update: mocks.adminUpdate }),
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { verifyOtp: mocks.verifyOtp },
    from: () => ({ upsert: mocks.profileUpsert }),
  }),
}))
vi.mock('@/lib/auth/household', () => ({ forgetHouseholdId: mocks.forgetHouseholdId }))

import { GET } from './route'

function request(query = '') {
  return new NextRequest(`http://localhost:3000/dev/login${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NODE_ENV', 'development')
  mocks.createUser.mockResolvedValue({ data: {}, error: null })
  mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'hash-1' } }, error: null })
  mocks.verifyOtp.mockResolvedValue({ data: { user: { id: 'dev-user' } }, error: null })
  mocks.profileUpsert.mockResolvedValue({ error: null })
  mocks.adminUpdateEq.mockResolvedValue({ error: null })
  mocks.adminUpdate.mockReturnValue({ eq: mocks.adminUpdateEq })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /dev/login', () => {
  it('is not available outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await GET(request())
    expect(res.status).toBe(404)
    expect(mocks.generateLink).not.toHaveBeenCalled()
  })

  it('signs the dev user in with a server-verified magic link and redirects to recipes', async () => {
    const res = await GET(request())
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: 'magiclink', email: 'dev@dapcook.local' })
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'hash-1' })
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe('http://localhost:3000/recipes')
  })

  it('carries on when the dev user already exists', async () => {
    mocks.createUser.mockResolvedValue({ data: {}, error: { code: 'email_exists', message: 'exists' } })
    const res = await GET(request())
    expect(res.status).toBe(307)
  })

  it('honours a relative next path and ignores absolute ones', async () => {
    expect((await GET(request('?next=/shopping'))).headers.get('location')).toBe('http://localhost:3000/shopping')
    expect((await GET(request('?next=//evil.com'))).headers.get('location')).toBe('http://localhost:3000/recipes')
  })

  it('detaches the dev user from its household with fresh=1 and opens onboarding', async () => {
    const res = await GET(request('?fresh=1'))
    expect(mocks.adminUpdate).toHaveBeenCalledWith({ household_id: null, ui_language: 'en' })
    expect(mocks.adminUpdateEq).toHaveBeenCalledWith('id', 'dev-user')
    expect(mocks.forgetHouseholdId).toHaveBeenCalledWith('dev-user')
    expect(res.headers.get('location')).toBe('http://localhost:3000/onboarding')
  })

  it('fails loudly when the magic link cannot be verified', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } })
    const res = await GET(request())
    expect(res.status).toBe(500)
  })
})
