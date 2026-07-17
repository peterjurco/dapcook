import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { canBypassAuth, isPublicPath, middleware } from './middleware'

const mocks = vi.hoisted(() => ({ createServerClient: vi.fn() }))

vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }))

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
