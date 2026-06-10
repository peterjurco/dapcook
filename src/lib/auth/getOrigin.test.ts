import { describe, it, expect, vi, beforeEach } from 'vitest'

const headersMock = vi.fn()
vi.mock('next/headers', () => ({ headers: () => headersMock() }))

function fakeHeaders(map: Record<string, string>) {
  return { get: (k: string) => map[k.toLowerCase()] ?? null }
}

import { getOrigin } from './getOrigin'

describe('getOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.NEXT_PUBLIC_SITE_URL
  })

  it('uses x-forwarded-host + proto (Vercel preview)', () => {
    headersMock.mockReturnValue(
      fakeHeaders({ 'x-forwarded-host': 'dapcook-git-feat-x-foo.vercel.app', 'x-forwarded-proto': 'https' }),
    )
    expect(getOrigin()).toBe('https://dapcook-git-feat-x-foo.vercel.app')
  })

  it('prefers x-forwarded-host over host', () => {
    headersMock.mockReturnValue(
      fakeHeaders({ 'x-forwarded-host': 'preview.vercel.app', host: 'internal:3000', 'x-forwarded-proto': 'https' }),
    )
    expect(getOrigin()).toBe('https://preview.vercel.app')
  })

  it('uses http for localhost when no proto header', () => {
    headersMock.mockReturnValue(fakeHeaders({ host: 'localhost:3000' }))
    expect(getOrigin()).toBe('http://localhost:3000')
  })

  it('defaults to https for non-local hosts without a proto header', () => {
    headersMock.mockReturnValue(fakeHeaders({ host: 'example.com' }))
    expect(getOrigin()).toBe('https://example.com')
  })

  it('falls back to NEXT_PUBLIC_SITE_URL when no host header', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://prod.example.com'
    headersMock.mockReturnValue(fakeHeaders({}))
    expect(getOrigin()).toBe('https://prod.example.com')
  })
})
