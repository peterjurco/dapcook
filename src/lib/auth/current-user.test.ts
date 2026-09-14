import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getCurrentProfile, getCurrentUser } from './current-user'

const mocks = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.single }) }),
    }),
  }),
}))

function signedIn(claims: Record<string, unknown>) {
  mocks.getClaims.mockResolvedValue({ data: { claims }, error: null })
}

beforeEach(() => {
  mocks.getClaims.mockReset()
  mocks.getUser.mockReset()
  mocks.single.mockReset()
})

describe('getCurrentUser', () => {
  it('returns the id and email carried by the verified token', async () => {
    signedIn({ sub: 'user-1', email: 'cook@dapcook.test' })

    expect(await getCurrentUser()).toEqual({ id: 'user-1', email: 'cook@dapcook.test' })
  })

  it('verifies the token locally instead of asking the auth server', async () => {
    signedIn({ sub: 'user-1', email: 'cook@dapcook.test' })

    await getCurrentUser()

    expect(mocks.getClaims).toHaveBeenCalledTimes(1)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('reports no email when the token carries no email claim', async () => {
    signedIn({ sub: 'user-1' })

    expect(await getCurrentUser()).toEqual({ id: 'user-1', email: null })
  })

  it('returns null when there is no session', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null })

    expect(await getCurrentUser()).toBeNull()
  })

  it('returns null when the token fails verification', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })

    expect(await getCurrentUser()).toBeNull()
  })

  it('returns null when the token has no subject', async () => {
    signedIn({ email: 'cook@dapcook.test' })

    expect(await getCurrentUser()).toBeNull()
  })
})

describe('getCurrentProfile', () => {
  it('loads the profile of the signed-in user', async () => {
    signedIn({ sub: 'user-1', email: 'cook@dapcook.test' })
    mocks.single.mockResolvedValue({ data: { id: 'user-1', household_id: 'house-1' } })

    expect(await getCurrentProfile()).toEqual({ id: 'user-1', household_id: 'house-1' })
  })

  it('returns null without querying when nobody is signed in', async () => {
    mocks.getClaims.mockResolvedValue({ data: null, error: null })

    expect(await getCurrentProfile()).toBeNull()
    expect(mocks.single).not.toHaveBeenCalled()
  })
})
