import { describe, expect, it } from 'vitest'
import { createShareToken } from './share-token'

describe('createShareToken', () => {
  it('returns 24 random bytes encoded as 32 URL-safe characters', () => {
    const token = createShareToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('does not reuse tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, createShareToken))
    expect(tokens.size).toBe(100)
  })
})
