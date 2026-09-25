import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { canBypassAuth, isPublicPath, middleware } from './middleware'

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))

/** Point the mocked Supabase client at a signed-in user, or at nobody. */
function session(claims: Record<string, unknown> | null) {
  mocks.createServerClient.mockReturnValue({
    auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
  })
  mocks.getClaims.mockResolvedValue(
    claims ? { data: { claims }, error: null } : { data: null, error: null }
  )
}

function request(pathname: string) {
  return new NextRequest(`https://dapcook.test${pathname}`)
}

describe('isPublicPath', () => {
  it.each(['/s', '/s/public-token'])('treats %s as public', (pathname) => {
    expect(isPublicPath(pathname)).toBe(true)
  })

  it('keeps recipe detail routes protected', () => {
    expect(isPublicPath('/recipes/recipe-1')).toBe(false)
  })

  it('allows crawlers to fetch the robots policy', () => {
    expect(isPublicPath('/robots.txt')).toBe(true)
  })

  it('lets the dev login through without a session', () => {
    expect(isPublicPath('/dev/login')).toBe(true)
  })

  it.each(['/s', '/s/public-token', '/robots.txt'])('bypasses Supabase Auth for %s', (pathname) => {
    expect(canBypassAuth(pathname)).toBe(true)
  })

  it.each(['/s', '/s/public-token', '/robots.txt'])('does not initialize Supabase Auth for %s', async (pathname) => {
    mocks.createServerClient.mockClear()

    const response = await middleware(new NextRequest(`https://dapcook.test${pathname}`))

    expect(response.status).toBe(200)
    expect(mocks.createServerClient).not.toHaveBeenCalled()
  })

  it('does not bypass Supabase Auth for login or authenticated routes', () => {
    expect(canBypassAuth('/login')).toBe(false)
    expect(canBypassAuth('/recipes')).toBe(false)
  })
})

describe('middleware session handling', () => {
  beforeEach(() => {
    mocks.createServerClient.mockReset()
    mocks.getClaims.mockReset()
    mocks.getUser.mockReset()
  })

  it('verifies the session locally instead of asking the auth server', async () => {
    session({ sub: 'user-1' })

    await middleware(request('/recipes'))

    expect(mocks.getClaims).toHaveBeenCalledTimes(1)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('lets a signed-in visitor through to a protected route', async () => {
    session({ sub: 'user-1' })

    const response = await middleware(request('/recipes'))

    expect(response.status).toBe(200)
  })

  it('sends an unauthenticated visitor to login, remembering where they were going', async () => {
    session(null)

    const response = await middleware(request('/planner'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://dapcook.test/login?next=%2Fplanner')
  })

  it('sends a signed-in visitor from the root to their recipes', async () => {
    session({ sub: 'user-1' })

    const response = await middleware(request('/'))

    expect(response.headers.get('location')).toBe('https://dapcook.test/recipes')
  })

  it('sends an unauthenticated visitor from the root to login', async () => {
    session(null)

    const response = await middleware(request('/'))

    expect(response.headers.get('location')).toBe('https://dapcook.test/login')
  })

  it('sends a signed-in visitor away from the login page', async () => {
    session({ sub: 'user-1' })

    const response = await middleware(request('/login'))

    expect(response.headers.get('location')).toBe('https://dapcook.test/recipes')
  })

  it('treats a token that fails verification as signed out', async () => {
    mocks.createServerClient.mockReturnValue({
      auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    })
    mocks.getClaims.mockResolvedValue({ data: null, error: new Error('Invalid JWT signature') })

    const response = await middleware(request('/recipes'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://dapcook.test/login?next=%2Frecipes')
  })
})
