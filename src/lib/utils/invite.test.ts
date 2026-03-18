import { describe, it, expect } from 'vitest'
import { generateInviteToken, isValidInviteToken } from './invite'

describe('generateInviteToken', () => {
  it('returns a string of 32 hex characters', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[a-f0-9]{32}$/)
  })

  it('returns a unique token each call', () => {
    const tokens = new Set(Array.from({ length: 10 }, () => generateInviteToken()))
    expect(tokens.size).toBe(10)
  })
})

describe('isValidInviteToken', () => {
  it('returns true for a valid 32-char hex token', () => {
    expect(isValidInviteToken('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(isValidInviteToken('')).toBe(false)
  })

  it('returns false for wrong length', () => {
    expect(isValidInviteToken('abc123')).toBe(false)
  })

  it('returns false for non-hex characters', () => {
    expect(isValidInviteToken('z1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')).toBe(false)
  })
})
