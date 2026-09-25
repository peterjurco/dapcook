import { describe, it, expect } from 'vitest'
import { generateInviteToken, isValidInviteToken, extractInviteToken } from './invite'

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

describe('extractInviteToken', () => {
  const token = 'a'.repeat(32)

  it('accepts a bare token, ignoring surrounding whitespace', () => {
    expect(extractInviteToken(`  ${token} `)).toBe(token)
  })

  it('pulls the token out of an invite link', () => {
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}`)).toBe(token)
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}/complete`)).toBe(token)
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}?utm=x`)).toBe(token)
  })

  it('returns null for anything else', () => {
    expect(extractInviteToken('')).toBeNull()
    expect(extractInviteToken('hello')).toBeNull()
    expect(extractInviteToken(`https://dapcook.vercel.app/recipes/${token}`)).toBeNull()
    expect(extractInviteToken(`https://dapcook.vercel.app/join/${token}abc`)).toBeNull()
  })
})
